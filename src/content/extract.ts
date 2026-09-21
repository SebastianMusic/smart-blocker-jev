import { Readability } from "@mozilla/readability";
import type { PagePayload } from "../shared/messages";

const TEXT_HEAD_CHARS = 5000;
const TEXT_TAIL_CHARS = 1000;
const MIN_READABLE_CHARS = 400;
const NOISE =
  "script, style, noscript, svg, iframe, nav, footer, aside, [aria-hidden=true], " +
  "input, textarea, select, button, " +
  ":is([id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i]):not(html, body)";

const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);

function meta(name: string): string {
  const el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`);
  return clip(el?.content, 300);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url, location.href).hostname || null;
  } catch {
    return null;
  }
}

function schemaTypes(): string[] {
  const types = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 4 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    for (const v of Array.isArray(t) ? t : [t]) if (typeof v === "string") types.add(v);
    walk(obj["@graph"], depth + 1);
    walk(obj["mainEntity"], depth + 1);
  };
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(s.textContent ?? ""), 0);
    } catch {
      /* malformed JSON-LD is common */
    }
  }
  return [...types].slice(0, 10);
}

function topDomains(urls: Iterable<string>, exclude: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const u of urls) {
    const h = hostOf(u);
    if (h && h !== exclude) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([h]) => h);
}

function compact(text: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 2 || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  const all = lines.join("\n");
  if (all.length <= TEXT_HEAD_CHARS + TEXT_TAIL_CHARS) return all;
  return `${all.slice(0, TEXT_HEAD_CHARS)}\n…\n${all.slice(-TEXT_TAIL_CHARS)}`;
}

function mainText(): string {
  const clone = document.cloneNode(true) as Document;
  clone.querySelectorAll(NOISE).forEach((el) => el.remove());
  let text = "";
  try {
    text = new Readability(clone, { charThreshold: MIN_READABLE_CHARS }).parse()?.textContent ?? "";
  } catch {
    /* fall through to the live-DOM fallback */
  }
  if (text.trim().length < MIN_READABLE_CHARS) {
    // Stores, dashboards and apps: Readability finds no article. Use rendered text instead.
    const root = document.querySelector<HTMLElement>("main, [role=main]") ?? document.body;
    text = root?.innerText ?? "";
  }
  return compact(text);
}

export function extractPayload(): PagePayload {
  const host = location.hostname;
  return {
    url: location.href,
    title: clip(document.title, 300),
    lang: document.documentElement.lang,
    description: meta("description") || meta("og:description"),
    og_type: meta("og:type"),
    og_site_name: meta("og:site_name"),
    canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? "",
    schema_types: schemaTypes(),
    headings: [...document.querySelectorAll<HTMLElement>("h1, h2, h3")]
      .map((h) => clip(h.innerText.replace(/\s+/g, " "), 120))
      .filter(Boolean)
      .slice(0, 25),
    flags: {
      password: !!document.querySelector("input[type=password]"),
      form_action_domains: topDomains(
        [...document.forms].map((f) => f.getAttribute("action") ?? "").filter(Boolean),
        "",
        10,
      ),
      outbound_link_domains: topDomains(
        [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => a.href),
        host,
        10,
      ),
      third_party_scripts: new Set(
        [...document.scripts].map((s) => (s.src ? hostOf(s.src) : null)).filter((h) => h && h !== host),
      ).size,
    },
    text: mainText(),
  };
}
