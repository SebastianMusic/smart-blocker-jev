import type { Message } from "../shared/messages";
import { urlKey } from "../shared/url";

// Registered at document_start while the extension is on.

const TIMEOUT_MS = 20_000;

let host: HTMLElement | null = null;
let hideStyle: HTMLStyleElement | null = null;
let screen: HTMLElement;
let title: HTMLElement;
let detail: HTMLElement;
let button: HTMLButtonElement;
let timer: ReturnType<typeof setTimeout> | undefined;
/** strict mode keeps a page that cannot be verified covered; otherwise the page is shown on timeout */
let strictMode = true;

const SHADOW_CSS = `
  .screen {
    position: fixed; inset: 0; display: grid; place-items: center; padding: 16px;
    background: #f7f7f5; color: #1d1d1f; font: 15px/1.5 system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) { .screen { background: #18181b; color: #ececef; } }
  .box { max-width: 520px; text-align: center; }
  h1 { font-size: 1.3rem; margin: 0 0 8px; }
  p { margin: 0 0 8px; opacity: 0.75; word-break: break-word; }
  .dot { display: inline-block; width: 10px; height: 10px; margin: 0 3px 16px; border-radius: 50%;
         background: #3b5bdb; animation: pulse 1s infinite ease-in-out; }
  .dot:nth-child(2) { animation-delay: .15s } .dot:nth-child(3) { animation-delay: .3s }
  @keyframes pulse { 0%, 100% { opacity: .2 } 50% { opacity: 1 } }
  .unverified .dots { display: none; }
  button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid #888;
           background: transparent; color: inherit; cursor: pointer; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function build() {
  hideStyle = el("style");
  hideStyle.textContent = "body { opacity: 0 !important; pointer-events: none !important; }";

  host = el("div");
  for (const [k, v] of Object.entries({
    all: "initial",
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    "max-width": "none",
    "max-height": "none",
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
    display: "block",
    "z-index": "2147483647",
  })) {
    host.style.setProperty(k, v, "important");
  }

  const shadow = host.attachShadow({ mode: "closed" });
  const style = el("style");
  style.textContent = SHADOW_CSS;
  screen = el("div", "screen");
  const box = el("div", "box");
  const dots = el("div", "dots");
  dots.append(el("span", "dot"), el("span", "dot"), el("span", "dot"));
  title = el("h1");
  detail = el("p");
  const url = el("p", "", location.href);
  button = el("button", "", "Show page anyway");
  button.addEventListener("click", () => {
    reveal();
    browser.runtime.sendMessage({ type: "unmute" } satisfies Message);
  });
  box.append(dots, title, detail, url, button);
  screen.append(box);
  shadow.append(style, screen);

  document.documentElement.append(hideStyle, host);
  try {
    // Top layer sits above anything the page can stack with z-index.
    host.popover = "manual";
    host.showPopover();
  } catch {
    /* z-index fallback */
  }
}

function cover() {
  if (!document.documentElement) return;
  if (!host) build();
  title.textContent = "Checking this page against your intention…";
  detail.textContent = "";
  button.hidden = true;
  screen.classList.remove("unverified");
  clearTimeout(timer);
  timer = setTimeout(() => (strictMode ? unverified("Verification took too long.") : reveal()), TIMEOUT_MS);
}

function unverified(reason: string) {
  if (!host) return;
  clearTimeout(timer);
  title.textContent = "This page couldn't be verified";
  detail.textContent = reason;
  button.hidden = false;
  screen.classList.add("unverified");
}

function reveal() {
  clearTimeout(timer);
  host?.remove();
  hideStyle?.remove();
  host = hideStyle = null;
}

const isCurrent = (url: string) => {
  try {
    return urlKey(url) === urlKey(location.href);
  } catch {
    return false;
  }
};

browser.runtime.onMessage.addListener((msg: Message) => {
  if (msg.type === "cover") cover();
  else if (msg.type === "reveal" && isCurrent(msg.url)) reveal();
  else if (msg.type === "unverified" && isCurrent(msg.url)) unverified(msg.detail);
});

cover();
browser.runtime
  .sendMessage({ type: "cover-check", url: location.href } satisfies Message)
  .then((r: { reveal?: boolean; strict?: boolean } | undefined) => {
    strictMode = r?.strict ?? true;
    if (r?.reveal) reveal();
  })
  .catch(() => undefined);
