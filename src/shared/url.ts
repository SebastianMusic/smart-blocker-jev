const TRACKING_PARAM = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_eid|igshid|ref_src)$/i;

export function isCheckableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Cache key for a page: no fragment, no tracking params, sorted query. */
export function urlKey(url: string): string {
  const u = new URL(url);
  u.hash = "";
  const params = [...u.searchParams].filter(([k]) => !TRACKING_PARAM.test(k));
  params.sort(([a], [b]) => a.localeCompare(b));
  u.search = new URLSearchParams(params).toString();
  return u.toString();
}

/** "example.com" matches example.com and any subdomain of it. */
export function hostMatches(host: string, domains: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return domains.some((d) => {
    const dom = d.trim().toLowerCase().replace(/^\*?\./, "");
    return dom !== "" && (h === dom || h.endsWith("." + dom));
  });
}

const REGEX_RULE = /^\/(.+)\/$/;

export const isRegexRule = (rule: string) => REGEX_RULE.test(rule.trim());

/** The syntax error of a `/pattern/` rule, or null if it compiles. */
export function regexRuleError(rule: string): string | null {
  try {
    new RegExp(REGEX_RULE.exec(rule.trim())?.[1] ?? "", "i");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const compiled = new Map<string, RegExp | null>();

function compileRule(rule: string): RegExp | null {
  if (!compiled.has(rule)) {
    compiled.set(rule, regexRuleError(rule) === null ? new RegExp(REGEX_RULE.exec(rule)![1]!, "i") : null);
  }
  return compiled.get(rule)!;
}

/**
 * A rule is a domain (matches it and its subdomains) or a case-insensitive
 * `/pattern/` tested against both the hostname and the full URL.
 */
export function ruleMatches(url: string, rules: readonly string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return rules.some((rule) => {
    const r = rule.trim();
    if (!isRegexRule(r)) return hostMatches(host, [r]);
    const re = compileRule(r);
    return !!re && (re.test(host) || re.test(url));
  });
}

/** One rule per line. Plain lines may hold several domains separated by spaces or commas; regex lines are kept whole. */
export function parseRuleList(text: string): string[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const t = line.trim();
    if (isRegexRule(t)) return [t];
    return t
      .split(/[\s,]+/)
      .map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter(Boolean);
  });
}
