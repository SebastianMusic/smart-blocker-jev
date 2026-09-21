import type { Message, StatusResponse } from "../shared/messages";
import { loadSettings, saveSettings } from "../shared/settings";
import { $, formatPercent } from "./dom";

const intention = $<HTMLTextAreaElement>("intention");
const save = $<HTMLButtonElement>("save");
const enabled = $<HTMLInputElement>("enabled");

let savedIntention = "";

async function refresh() {
  const s = await loadSettings();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const status: StatusResponse = await browser.runtime.sendMessage({
    type: "status",
    tabId: tab?.id ?? -1,
  } satisfies Message);

  enabled.checked = s.enabled;
  $("no-key").hidden = !!s.apiKey;

  const paused = status.stats.pausedUntil > Date.now();
  $("paused").hidden = !paused;
  if (paused) {
    $("pause-reason").textContent = status.stats.pauseReason;
    $("pause-until").textContent = new Date(status.stats.pausedUntil).toLocaleString();
  }

  const t = status.tab;
  const badge = $("tab-state");
  badge.textContent = t?.state ?? "not checked";
  badge.className = `badge s-${t?.state ?? "skipped"}`;
  $("tab-detail").textContent = t?.detail ?? "Nothing checked in this tab yet.";
  $("tab-noul").textContent = t?.noul !== undefined ? `jev match probability: ${formatPercent(t.noul)}` : "";

  $("calls").textContent = String(status.stats.callsToday);
  $("cached").textContent = String(status.stats.cachedVerdicts);
  $("blocked").textContent = String(status.stats.blockedCount);
}

async function init() {
  const s = await loadSettings();
  savedIntention = s.intention;
  intention.value = s.intention;
  await refresh();
}

intention.addEventListener("input", () => {
  save.disabled = intention.value.trim() === savedIntention.trim();
});

save.addEventListener("click", async () => {
  savedIntention = intention.value.trim();
  await saveSettings({ intention: savedIntention });
  save.disabled = true;
  setTimeout(refresh, 100);
});

enabled.addEventListener("change", async () => {
  await saveSettings({ enabled: enabled.checked });
});

$("flush").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "flush" } satisfies Message);
  await refresh();
});

$("resume").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "resume" } satisfies Message);
  await refresh();
});

$("options").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

init();
