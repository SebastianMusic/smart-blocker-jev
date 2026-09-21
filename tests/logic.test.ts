import { describe, expect, it } from "vitest";
import { decide } from "../src/background/jev";
import { DEFAULT_SETTINGS, verdictInputsChanged } from "../src/shared/settings";
import { hostMatches, isCheckableUrl, parseDomainList, urlKey } from "../src/shared/url";

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

describe("parseDomainList", () => {
  it("normalises pasted URLs and blank lines", () => {
    expect(parseDomainList("https://Reddit.com/r/x\n\n news.ycombinator.com ")).toEqual([
      "reddit.com",
      "news.ycombinator.com",
    ]);
  });
});

describe("isCheckableUrl", () => {
  it("only accepts http(s)", () => {
    expect(isCheckableUrl("https://a.com")).toBe(true);
    expect(isCheckableUrl("moz-extension://abc/pages/blocked.html")).toBe(false);
    expect(isCheckableUrl("about:blank")).toBe(false);
  });
});

describe("decide", () => {
  it("splits into block / uncertain / allow", () => {
    expect(decide(0.1, 0.3, 0.7)).toBe("block");
    expect(decide(0.3, 0.3, 0.7)).toBe("uncertain");
    expect(decide(0.5, 0.3, 0.7)).toBe("uncertain");
    expect(decide(0.71, 0.3, 0.7)).toBe("allow");
  });
});

describe("verdictInputsChanged", () => {
  it("flushes on intention or threshold changes, not on unrelated settings", () => {
    const base = DEFAULT_SETTINGS;
    expect(verdictInputsChanged(base, { ...base, intention: "study" })).toBe(true);
    expect(verdictInputsChanged(base, { ...base, blockBelow: 0.2 })).toBe(true);
    expect(verdictInputsChanged(base, { ...base, maxCallsPerDay: 10 })).toBe(false);
  });
});
