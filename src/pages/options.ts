import type { Message, StatusResponse } from "../shared/messages";
import { HARD_LIMITS, loadSettings, saveSettings, type Settings } from "../shared/settings";
import { parseDomainList } from "../shared/url";
import { $, formatPercent } from "./dom";

const TEXT_FIELDS = ["intention", "apiKey", "model"] as const;
const NUMBER_FIELDS = ["threshold", "minIntervalMs", "maxCallsPerMinute", "maxCallsPerDay"] as const;
const LIST_FIELDS = ["allowDomains", "blockDomains", "neverCheckDomains"] as const;

const field = (id: string) => $<HTMLInputElement | HTMLTextAreaElement>(id);
const savedMsg = $("saved");
const strictMode = $<HTMLInputElement>("strictMode");
const threshold = $<HTMLInputElement>("threshold");
const showThreshold = () => ($("threshold-value").textContent = formatPercent(Number(threshold.value)));
threshold.addEventListener("input", showThreshold);

async function refreshCounts() {
  const status: StatusResponse = await browser.runtime.sendMessage({ type: "status", tabId: -1 } satisfies Message);
  $("cached").textContent = String(status.stats.cachedVerdicts);
  $("blocked").textContent = String(status.stats.blockedCount);
}

async function init() {
  const s = await loadSettings();
  for (const k of TEXT_FIELDS) field(k).value = s[k];
  for (const k of NUMBER_FIELDS) field(k).value = String(s[k]);
  for (const k of LIST_FIELDS) field(k).value = s[k].join("\n");
  strictMode.checked = s.strictMode;
  showThreshold();
  $("hard").textContent =
    `${HARD_LIMITS.minIntervalMs} ms between calls, ` +
    `${HARD_LIMITS.maxCallsPerMinute}/minute, ${HARD_LIMITS.maxCallsPerDay}/day`;
  await refreshCounts();
}

$<HTMLFormElement>("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const patch: Partial<Settings> = {};
  for (const k of TEXT_FIELDS) patch[k] = field(k).value.trim();
  for (const k of NUMBER_FIELDS) patch[k] = Number(field(k).value);
  for (const k of LIST_FIELDS) patch[k] = parseDomainList(field(k).value);
  patch.strictMode = strictMode.checked;

  if (!patch.model) patch.model = "jev-latest";

  await saveSettings(patch);
  savedMsg.textContent = "Saved.";
  setTimeout(refreshCounts, 100);
});

$("flush").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "flush" } satisfies Message);
  await refreshCounts();
});

init();
