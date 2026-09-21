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

export function parseDomainList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((l) => l.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}
