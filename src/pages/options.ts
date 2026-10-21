import { exportSettings, FORMATS, formatForFile, importSettings } from "../shared/config";
import type { Message, StatusResponse } from "../shared/messages";
import { DEFAULT_ENDPOINT, HARD_LIMITS, loadSettings, saveSettings, type Settings } from "../shared/settings";
import { isRegexRule, parseRuleList, regexRuleError } from "../shared/url";
import { $, formatPercent, setProviderName } from "./dom";

const TEXT_FIELDS = ["intention", "endpoint", "apiKey", "model", "providerName"] as const;
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

function fillForm(s: Settings) {
  for (const k of TEXT_FIELDS) field(k).value = s[k];
  for (const k of NUMBER_FIELDS) field(k).value = String(s[k]);
  for (const k of LIST_FIELDS) field(k).value = s[k].join("\n");
  strictMode.checked = s.strictMode;
  showThreshold();
  setProviderName(s.providerName);
}

async function init() {
  fillForm(await loadSettings());
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
  for (const k of LIST_FIELDS) patch[k] = parseRuleList(field(k).value);

  const invalid = LIST_FIELDS.flatMap((k) =>
    patch[k]!.flatMap((rule) => {
      const err = isRegexRule(rule) ? regexRuleError(rule) : null;
      return err ? [`${rule}: ${err}`] : [];
    }),
  );
  if (invalid.length > 0) {
    savedMsg.textContent = `Not saved. Invalid pattern: ${invalid.join("; ")}`;
    return;
  }
  patch.strictMode = strictMode.checked;

  if (!patch.model) patch.model = "jev-latest";
  if (!patch.endpoint) patch.endpoint = DEFAULT_ENDPOINT;
  if (!patch.providerName) patch.providerName = "jev";

  await saveSettings(patch);
  savedMsg.textContent = "Saved.";
  setTimeout(refreshCounts, 100);
});

$("flush").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "flush" } satisfies Message);
  await refreshCounts();
});

const fileInput = $<HTMLInputElement>("import-file");
const ioMsg = $("io-msg");
fileInput.accept = FORMATS.flatMap((f) => f.extensions).join(",");

function showIoResult(heading: string, lines: string[]) {
  const list = document.createElement("ul");
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
  }
  const p = document.createElement("p");
  p.textContent = heading;
  ioMsg.replaceChildren(p, ...(lines.length > 0 ? [list] : []));
}

$("export").addEventListener("click", async () => {
  const { filename, content, mimeType } = exportSettings(await loadSettings(), {
    includeApiKey: $<HTMLInputElement>("export-key").checked,
  });
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  showIoResult(`Exported saved settings to ${filename}.`, []);
});

$("import").addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  const format = formatForFile(file.name);
  if (!format) {
    const supported = FORMATS.flatMap((f) => f.extensions).join(", ");
    return showIoResult(`Not imported: ${file.name} is not a supported file type (${supported}).`, []);
  }
  const result = importSettings(await file.text(), format);
  if (result.errors.length > 0) {
    return showIoResult(`Not imported: ${file.name} has problems, nothing was changed.`, result.errors);
  }
  fillForm(await saveSettings(result.settings));
  const count = Object.keys(result.settings).length;
  showIoResult(`Imported ${count} setting${count === 1 ? "" : "s"} from ${file.name}.`, result.warnings);
  setTimeout(refreshCounts, 100);
});

init();
