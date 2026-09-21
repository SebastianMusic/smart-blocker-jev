import { getDomain, getDomainWithoutSuffix } from "tldts";
import type { Message, PagePayload, StatusResponse, TabState, TabStatus } from "../shared/messages";
import { DEFAULT_SETTINGS, loadSettings, verdictInputsChanged, type Settings } from "../shared/settings";
import { hostMatches, isCheckableUrl, urlKey } from "../shared/url";
import { checkAllowance, effectiveLimits, Guard } from "./guard";
import { askJev, decide } from "./jev";
import { VerdictStore } from "./verdicts";

const UNCERTAIN_MEMO_MS = 2 * 60_000;
const SPA_SETTLE_MS = 1500;
const NEVER_CHECK_HOSTS = ["api.typesafe.ai"];

const guard = new Guard();
const verdicts = new VerdictStore();
const tabStatus = new Map<number, TabStatus>();
/** Single-flight: concurrent checks of one URL share one API call. */
const inflight = new Map<string, Promise<ModelRun>>();
/** Uncertain answers are not cached, but are remembered briefly so reloads don't re-bill. */
const recentUncertain = new Map<string, { noul: number; at: number }>();
const spaTimers = new Map<number, ReturnType<typeof setTimeout>>();

type Quick =
  | { kind: "skip"; detail: string }
  | { kind: "allow" | "block" | "uncertain"; noul?: number; detail: string }
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
  if (hostMatches(host, NEVER_CHECK_HOSTS)) return { kind: "skip", detail: "Internal" };
  if (hostMatches(host, s.neverCheckDomains) || /bank/i.test(getDomainWithoutSuffix(host) ?? "")) {
    return { kind: "skip", detail: "Sensitive site, never sent to jev" };
  }
  if (hostMatches(host, s.allowDomains)) return { kind: "allow", detail: "On your allow list" };
  if (hostMatches(host, s.blockDomains)) return { kind: "block", detail: "On your block list" };
  if (!s.intention.trim()) return { kind: "skip", detail: "No intention set" };

  const key = urlKey(url);
  const cached = await verdicts.get(key);
  if (cached) return { kind: cached.decision, noul: cached.noul, detail: "Cached verdict" };
  const memo = recentUncertain.get(key);
  if (memo && Date.now() - memo.at < UNCERTAIN_MEMO_MS) {
    return { kind: "uncertain", noul: memo.noul, detail: "jev was unsure recently; allowed" };
  }
  if (!s.apiKey) return { kind: "skip", detail: "No TypeSafe API key set" };
  return { kind: "need-model", key };
}

async function redirectToBlocked(tabId: number, url: string, detail: string, noul?: number) {
  const params = new URLSearchParams({ url, detail });
  if (noul !== undefined) params.set("noul", String(noul));
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
    const result = await askJev(s.apiKey, s.model, s.intention, { ...payload, domain });
    await guard.report(result.outcome);
    if (result.outcome !== "ok") {
      return { kind: "not-run", state: "error", detail: `jev call failed (${result.message}); allowed` };
    }
    return { kind: "verdict", noul: result.noul };
  })().finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}

async function evaluate(tabId: number, url: string) {
  const s = await loadSettings();
  const q = await quickDecision(s, url);

  switch (q.kind) {
    case "skip":
      return setStatus(tabId, url, "skipped", q.detail);
    case "allow":
      return setStatus(tabId, url, "allowed", q.detail, q.noul);
    case "uncertain":
      return setStatus(tabId, url, "uncertain", q.detail, q.noul);
    case "block":
      setStatus(tabId, url, "blocked", q.detail, q.noul);
      return redirectToBlocked(tabId, url, q.detail, q.noul);
  }

  setStatus(tabId, url, "checking", "Asking jev");
  const generation = verdicts.generation;
  const run = await runModel(tabId, url, q.key, s);
  if (run.kind === "not-run") return setStatus(tabId, url, run.state, run.detail);

  if (generation !== verdicts.generation) {
    return setStatus(tabId, url, "skipped", "Settings changed during the check; reload to re-check", run.noul);
  }

  const { noul } = run;
  switch (decide(noul, s.blockBelow, s.allowAbove)) {
    case "allow":
      await verdicts.set(q.key, { decision: "allow", noul, at: Date.now() }, generation);
      return setStatus(tabId, url, "allowed", "Matches your intention", noul);
    case "uncertain":
      recentUncertain.set(q.key, { noul, at: Date.now() });
      return setStatus(tabId, url, "uncertain", "jev is unsure; allowed without caching", noul);
    case "block": {
      await verdicts.set(q.key, { decision: "block", noul, at: Date.now() }, generation);
      setStatus(tabId, url, "blocked", "Does not match your intention", noul);
      const tab = await browser.tabs.get(tabId).catch(() => null);
      if (safeKey(tab?.url) === q.key) await redirectToBlocked(tabId, url, "Does not match your intention", noul);
    }
  }
}

async function flushVerdicts() {
  await verdicts.flush();
  recentUncertain.clear();
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
  }
});

// Fast path: cached blocks and block-list domains redirect before the page loads. Never calls jev.
browser.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  const q = await quickDecision(await loadSettings(), url).catch(() => null);
  if (q?.kind === "block") {
    setStatus(tabId, url, "blocked", q.detail, q.noul);
    await redirectToBlocked(tabId, url, q.detail, q.noul);
  }
});

// Single-page apps change URL without a page load; wait for the new content to settle.
browser.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  clearTimeout(spaTimers.get(tabId));
  spaTimers.set(
    tabId,
    setTimeout(async () => {
      spaTimers.delete(tabId);
      const tab = await browser.tabs.get(tabId).catch(() => null);
      if (tab?.url && safeKey(tab.url) === safeKey(url)) {
        evaluate(tabId, tab.url).catch((e) => console.error("evaluate failed", e));
      }
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
});
