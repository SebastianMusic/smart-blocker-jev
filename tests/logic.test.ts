import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, verdictInputsChanged } from "../src/shared/settings";
import { hostMatches, isCheckableUrl, parseRuleList, regexRuleError, ruleMatches, urlKey } from "../src/shared/url";

describe("urlKey", () => {
  it("drops fragments and tracking params and sorts the query", () => {
    expect(urlKey("https://Example.com/a?z=1&utm_source=x&a=2#top")).toBe("https://example.com/a?a=2&z=1");
  });
  it("keeps search terms", () => {
    expect(urlKey("https://www.google.com/search?q=cats")).toBe("https://www.google.com/search?q=cats");
  });
});

describe("hostMatches", () => {
  it("matches the domain and its subdomains only", () => {
    expect(hostMatches("youtube.com", ["youtube.com"])).toBe(true);
    expect(hostMatches("m.youtube.com", ["youtube.com"])).toBe(true);
    expect(hostMatches("notyoutube.com", ["youtube.com"])).toBe(false);
    expect(hostMatches("m.youtube.com", ["*.youtube.com"])).toBe(true);
    expect(hostMatches("anything.com", [""])).toBe(false);
  });
});

describe("parseRuleList", () => {
  it("normalises pasted URLs and blank lines", () => {
    expect(parseRuleList("https://Reddit.com/r/x\n\n news.ycombinator.com ")).toEqual([
      "reddit.com",
      "news.ycombinator.com",
    ]);
  });
});

describe("parseRuleList with regex", () => {
  it("keeps regex lines whole, including spaces, commas and case", () => {
    expect(parseRuleList("/a{1,3} B/\nExample.com, foo.org\n  /^m\\./  ")).toEqual([
      "/a{1,3} B/",
      "example.com",
      "foo.org",
      "/^m\\./",
    ]);
  });
});

describe("ruleMatches", () => {
  const shorts = "https://www.youtube.com/shorts/abc123";
  const video = "https://www.youtube.com/watch?v=xyz";

  it("treats plain rules as domains with subdomains", () => {
    expect(ruleMatches(shorts, ["youtube.com"])).toBe(true);
    expect(ruleMatches("https://notyoutube.com/", ["youtube.com"])).toBe(false);
  });

  it("matches regex rules against the full URL", () => {
    expect(ruleMatches(shorts, ["/youtube\\.com\\/shorts/"])).toBe(true);
    expect(ruleMatches(video, ["/youtube\\.com\\/shorts/"])).toBe(false);
    expect(ruleMatches("https://www.google.com/search?q=pasta+recipe", ["/[?&]q=.*recipe/"])).toBe(true);
  });

  it("matches regex rules against the hostname, so anchors work", () => {
    const rule = ["/^(www\\.)?reddit\\.com$/"];
    expect(ruleMatches("https://reddit.com/r/x", rule)).toBe(true);
    expect(ruleMatches("https://www.reddit.com/", rule)).toBe(true);
    expect(ruleMatches("https://old.reddit.com/", rule)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(ruleMatches("https://example.com/Shorts/1", ["/SHORTS/"])).toBe(true);
  });

  it("ignores invalid patterns instead of throwing", () => {
    expect(ruleMatches(shorts, ["/(unclosed/"])).toBe(false);
    expect(ruleMatches(shorts, ["/(unclosed/", "youtube.com"])).toBe(true);
  });

  it("gives the same answer on repeated calls (no stateful regex)", () => {
    for (let i = 0; i < 3; i++) expect(ruleMatches(shorts, ["/shorts/"])).toBe(true);
  });
});

describe("regexRuleError", () => {
  it("reports invalid patterns and accepts valid ones", () => {
    expect(regexRuleError("/(unclosed/")).toMatch(/./);
    expect(regexRuleError("/youtube\\.com/")).toBeNull();
  });
});

describe("isCheckableUrl", () => {
  it("only accepts http(s)", () => {
    expect(isCheckableUrl("https://a.com")).toBe(true);
    expect(isCheckableUrl("moz-extension://abc/pages/blocked.html")).toBe(false);
    expect(isCheckableUrl("about:blank")).toBe(false);
  });
});

describe("verdictInputsChanged", () => {
  it("flushes on intention or threshold changes, not on unrelated settings", () => {
    const base = DEFAULT_SETTINGS;
    expect(verdictInputsChanged(base, { ...base, intention: "study" })).toBe(true);
    expect(verdictInputsChanged(base, { ...base, threshold: 0.2 })).toBe(true);
    expect(verdictInputsChanged(base, { ...base, maxCallsPerDay: 10 })).toBe(false);
  });
});
