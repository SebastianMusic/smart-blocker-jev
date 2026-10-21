import { clearDebugLog, readDebugLog, type DebugEntry } from "../shared/debuglog";
import { loadSettings } from "../shared/settings";
import { $, formatPercent, setProviderName } from "./dom";

const BADGE_CLASS: Record<string, string> = { block: "s-blocked", allow: "s-allowed" };

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text || "(no response body)";
  }
}

function renderEntry(e: DebugEntry, open: boolean): HTMLElement {
  const node = ($<HTMLTemplateElement>("entry").content.cloneNode(true) as DocumentFragment)
    .firstElementChild as HTMLDetailsElement;
  const f = (name: string) => node.querySelector<HTMLElement>(`[data-f="${name}"]`)!;

  f("result").textContent = e.result;
  f("result").classList.add(BADGE_CLASS[e.result] ?? "s-error");
  const noul = e.noul !== undefined ? ` · noul ${e.noul.toFixed(3)} (${formatPercent(e.noul)})` : "";
  f("meta").textContent =
    `${new Date(e.at).toLocaleTimeString()} · HTTP ${e.status ?? "–"} · ${e.ms} ms${noul}` +
    ` · threshold ${formatPercent(e.threshold)}${e.strict ? " · strict" : ""}`;
  f("url").textContent = e.url;
  f("request").textContent = JSON.stringify(e.request, null, 2);
  f("response").textContent = pretty(e.response);
  node.open = open;
  return node;
}

async function render() {
  const openKeys = new Set(
    [...document.querySelectorAll<HTMLDetailsElement>("#log details")].filter((d) => d.open).map((d) => d.dataset.key),
  );
  const log = await readDebugLog();
  const s = await loadSettings();
  $("empty").hidden = log.length > 0;
  $("log").replaceChildren(
    ...log.map((e) => {
      const key = `${e.at}|${e.url}`;
      const node = renderEntry(e, openKeys.has(key));
      node.dataset.key = key;
      return node;
    }),
  );
  setProviderName(s.providerName);
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.debugLog) render();
});

$("clear").addEventListener("click", clearDebugLog);

render();
