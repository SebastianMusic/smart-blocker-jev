import { getDomain, getDomainWithoutSuffix } from "tldts";
import { appendDebug } from "../shared/debuglog";
import type { Message, PagePayload, StatusResponse, TabState, TabStatus } from "../shared/messages";
import { DEFAULT_SETTINGS, loadSettings, verdictInputsChanged, type Settings } from "../shared/settings";
import { hostMatches, isCheckableUrl, ruleMatches, urlKey } from "../shared/url";
import { checkAllowance, effectiveLimits, Guard } from "./guard";
import { decide, thresholdRule } from "./decision";
import { askJev } from "./jev";
import { VerdictStore } from "./verdicts";

const SPA_SETTLE_MS = 1500;
const NEVER_CHECK_HOSTS = ["api.typesafe.ai"];

const guard = new Guard();
const verdicts = new VerdictStore();
const tabStatus = new Map<number, TabStatus>();
/** Single-flight: concurrent checks of one URL share one API call. */
const inflight = new Map<string, Promise<ModelRun>>();
const spaTimers = new Map<number, ReturnType<typeof setTimeout>>();

type Quick =
  | { kind: "skip"; detail: string }
  | { kind: "allow" | "block"; noul?: number; detail: string }
  | { kind: "need-model"; key: string };

type ModelRun = { kind: "verdict"; noul: number } | { kind: "not-run"; state: TabState; detail: string };

function setStatus(tabId: number, url: string, state: TabState, detail: string, noul?: number) {
  tabStatus.set(tabId, { url, state, detail, noul });
}

function safeKey(url: string | undefined): string | null {
  try {
    return url ? urlKey(url) : null;
  } catch {
    return null;
  }
}

async function quickDecision(s: Settings, url: string): Promise<Quick> {
  if (!s.enabled) return { kind: "skip", detail: "Smart Blocker is paused" };
  if (!isCheckableUrl(url)) return { kind: "skip", detail: "Not a web page" };
  const host = new URL(url).hostname;
  const internal = [...NEVER_CHECK_HOSTS];
  try {
    internal.push(new URL(s.endpoint).hostname);
  } catch {
    /* the settings import guard keeps endpoint a valid http(s) URL */
  }
  if (hostMatches(host, internal)) return { kind: "skip", detail: "Internal" };
  if (ruleMatches(url, s.neverCheckDomains) || /bank/i.test(getDomainWithoutSuffix(host) ?? "")) {
    return { kind: "skip", detail: `Sensitive site, never sent to ${s.providerName}` };
  }
  if (ruleMatches(url, s.allowDomains)) return { kind: "allow", detail: "On your allow list" };
  if (ruleMatches(url, s.blockDomains)) return { kind: "block", detail: "On your block list" };
  if (!s.intention.trim()) return { kind: "skip", detail: "No intention set" };

  const key = urlKey(url);
  const cached = await verdicts.get(key);
  if (cached) return { kind: cached.decision, noul: cached.noul, detail: "Cached verdict" };
  return { kind: "need-model", key };
}

async function redirectToBlocked(tabId: number, url: string, s: Settings, detail: string, noul?: number) {
  const params = new URLSearchParams({ url, detail });
  if (noul !== undefined) {
    params.set("noul", String(noul));
    params.set("rule", thresholdRule(s.threshold));
  }
  await browser.tabs.update(tabId, {
    url: browser.runtime.getURL(`pages/blocked.html?${params}`),
    loadReplace: true,
  });
}

function runModel(tabId: number, url: string, key: string, s: Settings): Promise<ModelRun> {
  let pending = inflight.get(key);
  if (pending) return pending;

  pending = (async (): Promise<ModelRun> => {
    const limits = effectiveLimits(s);
    // Cheap pre-check so we don't extract page content when the call would be refused anyway.
    const pre = checkAllowance(await guard.snapshot(), limits, Date.now());
    if (!pre.ok) return { kind: "not-run", state: "rate-limited", detail: `Not checked: ${pre.reason}` };

    let payload: PagePayload;
    try {
      payload = await browser.tabs.sendMessage(tabId, { type: "extract" } satisfies Message);
    } catch {
      return { kind: "not-run", state: "error", detail: "Could not read the page" };
    }
    if (safeKey(payload?.url) !== key) {
      return { kind: "not-run", state: "skipped", detail: "Page changed before it could be checked" };
    }

    const allowance = await guard.acquire(limits);
    if (!allowance.ok) return { kind: "not-run", state: "rate-limited", detail: `Not checked: ${allowance.reason}` };

    const domain = getDomain(payload.url) ?? new URL(payload.url).hostname;
    const result = await askJev(s.endpoint, s.apiKey, s.model, s.intention, { ...payload, domain });
    await guard.report(result.outcome);
    appendDebug({
      at: Date.now(),
      url,
      result: result.outcome === "ok" ? decide(result.noul, s.threshold) : result.message,
      noul: result.outcome === "ok" ? result.noul : undefined,
      threshold: s.threshold,
      strict: isStrict(s),
      ...result.trace,
    }).catch((e) => console.error("debug log failed", e));
    if (result.outcome !== "ok") {
      return { kind: "not-run", state: "error", detail: `${s.providerName} call failed (${result.message}); allowed` };
    }
    return { kind: "verdict", noul: result.noul };
  })().finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}

const isStrict = (s: Settings) => s.enabled && s.strictMode;

const QUICK_STATE = { skip: "skipped", allow: "allowed", block: "blocked" } as const;

async function muteWhileVerifying(tabId: number) {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (tab && !tab.mutedInfo?.muted) await browser.tabs.update(tabId, { muted: true }).catch(() => undefined);
}

/** Unmutes only if this extension did the muting, never a tab the user muted. */
async function restoreAudio(tabId: number) {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  const m = tab?.mutedInfo;
  if (m?.muted && m.reason === "extension" && m.extensionId === browser.runtime.id) {
    await browser.tabs.update(tabId, { muted: false }).catch(() => undefined);
  }
}

function tellOverlay(tabId: number, msg: Message) {
  return browser.tabs.sendMessage(tabId, msg, { frameId: 0 }).catch(() => undefined);
}

/** Records the final outcome for a page and acts on it (block, or reveal/hide the checking screen). */
async function finish(tabId: number, url: string, s: Settings, state: TabState, detail: string, noul?: number) {
  setStatus(tabId, url, state, detail, noul);

  if (state === "blocked") {
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (safeKey(tab?.url) !== safeKey(url)) return;
    await restoreAudio(tabId);
    return redirectToBlocked(tabId, url, s, detail, noul);
  }
  if (isStrict(s) && (state === "rate-limited" || state === "error")) {
    return tellOverlay(tabId, { type: "unverified", url, detail });
  }
  await tellOverlay(tabId, { type: "reveal", url });
  await restoreAudio(tabId);
}

async function evaluate(tabId: number, url: string) {
  const s = await loadSettings();
  const q = await quickDecision(s, url);
  if (q.kind !== "need-model") {
    return finish(tabId, url, s, QUICK_STATE[q.kind], q.detail, "noul" in q ? q.noul : undefined);
  }

  setStatus(tabId, url, "checking", `Asking ${s.providerName}`);
  const generation = verdicts.generation;
  const run = await runModel(tabId, url, q.key, s);
  if (run.kind === "not-run") return finish(tabId, url, s, run.state, run.detail);

  if (generation !== verdicts.generation) {
    return finish(tabId, url, s, "error", "Settings changed during the check; reload to re-check", run.noul);
  }

  const { noul } = run;
  const decision = decide(noul, s.threshold);
  await verdicts.set(q.key, { decision, noul, at: Date.now() }, generation);
  return decision === "allow"
    ? finish(tabId, url, s, "allowed", "Matches your intention", noul)
    : finish(tabId, url, s, "blocked", "Does not match your intention", noul);
}

/** Answers the checking overlay: can the page be shown right away, without asking the model? */
async function coverCheck(tabId: number, url: string): Promise<{ reveal: boolean; strict: boolean }> {
  const s = await loadSettings();
  if (!s.enabled) return { reveal: true, strict: false };
  const q = await quickDecision(s, url).catch(() => null);
  if (q?.kind === "allow" || q?.kind === "skip") return { reveal: true, strict: isStrict(s) };
  if (q?.kind !== "block") await muteWhileVerifying(tabId);
  return { reveal: false, strict: isStrict(s) };
}

const OVERLAY_ID = "strict-overlay";

async function syncOverlayRegistration(s: Settings) {
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: [OVERLAY_ID] });
  if (s.enabled && registered.length === 0) {
    await browser.scripting.registerContentScripts([
      {
        id: OVERLAY_ID,
        js: ["overlay.js"],
        matches: ["http://*/*", "https://*/*"],
        runAt: "document_start",
        persistAcrossSessions: true,
      },
    ]);
  } else if (!s.enabled && registered.length > 0) {
    await browser.scripting.unregisterContentScripts({ ids: [OVERLAY_ID] });
  }
}

function flushVerdicts() {
  return verdicts.flush();
}

async function stats(): Promise<StatusResponse["stats"]> {
  const [counts, g] = await Promise.all([verdicts.counts(), guard.snapshot()]);
  const today = new Date().toISOString().slice(0, 10);
  return {
    cachedVerdicts: counts.total,
    blockedCount: counts.blocked,
    callsToday: g.day === today ? g.dayCount : 0,
    pausedUntil: g.pausedUntil,
    pauseReason: g.pauseReason,
  };
}

browser.runtime.onMessage.addListener((msg: Message, sender) => {
  switch (msg.type) {
    case "page-ready":
      if (sender.tab?.id !== undefined && sender.frameId === 0) {
        evaluate(sender.tab.id, msg.url).catch((e) => console.error("evaluate failed", e));
      }
      return;
    case "status":
      return stats().then((st): StatusResponse => ({ tab: tabStatus.get(msg.tabId) ?? null, stats: st }));
    case "flush":
      return flushVerdicts();
    case "resume":
      return guard.resume();
    case "cover-check":
      if (sender.tab?.id === undefined || sender.frameId !== 0) return Promise.resolve({ reveal: true });
      return coverCheck(sender.tab.id, msg.url);
    case "unmute":
      if (sender.tab?.id !== undefined) return restoreAudio(sender.tab.id);
      return;
  }
});

// Fast path: cached blocks and block-list domains redirect before the page loads. Never calls jev.
browser.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  const s = await loadSettings();
  const q = await quickDecision(s, url).catch(() => null);
  if (q?.kind === "block") {
    setStatus(tabId, url, "blocked", q.detail, q.noul);
    await redirectToBlocked(tabId, url, s, q.detail, q.noul);
  }
});

// Single-page apps change URL without a page load; wait for the new content to settle.
browser.webNavigation.onHistoryStateUpdated.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  clearTimeout(spaTimers.get(tabId));
  spaTimers.delete(tabId);

  const s = await loadSettings();
  const q = await quickDecision(s, url).catch(() => null);
  if (!q) return;
  if (q.kind !== "need-model") {
    return finish(tabId, url, s, QUICK_STATE[q.kind], q.detail, "noul" in q ? q.noul : undefined);
  }

  if (s.enabled) {
    await tellOverlay(tabId, { type: "cover" });
    await muteWhileVerifying(tabId);
  }
  spaTimers.set(
    tabId,
    setTimeout(async () => {
      spaTimers.delete(tabId);
      const tab = await browser.tabs.get(tabId).catch(() => null);
      if (tab?.url) evaluate(tabId, tab.url).catch((e) => console.error("evaluate failed", e));
    }, SPA_SETTLE_MS),
  );
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabStatus.delete(tabId);
  clearTimeout(spaTimers.get(tabId));
  spaTimers.delete(tabId);
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  const before = { ...DEFAULT_SETTINGS, ...(changes.settings.oldValue as Partial<Settings> | undefined) };
  const after = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Partial<Settings> | undefined) };
  if (verdictInputsChanged(before, after)) flushVerdicts();
  if (before.apiKey !== after.apiKey) guard.resume();
  if (before.enabled !== after.enabled) syncOverlayRegistration(after);
});

// Keep the checking overlay in line with settings whenever the event page wakes.
browser.runtime.onStartup.addListener(() => undefined);
loadSettings().then(syncOverlayRegistration).catch((e) => console.error("overlay sync failed", e));
