import { loadSettings } from "../shared/settings";
import { $, formatPercent, setProviderName } from "./dom";

async function init() {
  const params = new URLSearchParams(location.search);
  const s = await loadSettings();

  $("url").textContent = params.get("url") ?? "";
  setProviderName(s.providerName);
  $("detail").textContent = params.get("detail") ?? "";
  $("intention").textContent = s.intention || "(none set)";

  const noul = Number(params.get("noul"));
  if (params.has("noul") && Number.isFinite(noul)) {
    $("noul-block").hidden = false;
    $("noul").textContent = formatPercent(noul);
    const rule = params.get("rule");
    $("rule").textContent = rule ? ` (${rule})` : "";
    $("meter").style.width = formatPercent(noul);
  }
}

$("back").addEventListener("click", async () => {
  if (history.length > 1) {
    history.back();
  } else {
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== undefined) browser.tabs.remove(tab.id);
  }
});

$("options").addEventListener("click", () => browser.runtime.openOptionsPage());

init();
