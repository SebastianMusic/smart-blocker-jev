import { describe, expect, it } from "vitest";
import { decide, thresholdRule } from "../src/background/decision";
import { DEFAULT_SETTINGS } from "../src/shared/settings";

describe("decide", () => {
  it("blocks strictly below the threshold and allows at or above it", () => {
    expect(decide(0, 0.5)).toBe("block");
    expect(decide(0.49, 0.5)).toBe("block");
    expect(decide(0.5, 0.5)).toBe("allow");
    expect(decide(0.57, 0.5)).toBe("allow");
    expect(decide(1, 0.5)).toBe("allow");
  });

  it("defaults to allowing anything from 30% up", () => {
    const t = DEFAULT_SETTINGS.threshold;
    expect(t).toBe(0.3);
    expect(decide(0.29, t)).toBe("block");
    expect(decide(0.3, t)).toBe("allow");
    expect(decide(0.57, t)).toBe("allow");
  });

  it("follows the configured threshold", () => {
    expect(decide(0.57, 0.6)).toBe("block");
    expect(decide(0.57, 0.55)).toBe("allow");
  });

  it("matches the rule for every probability at every slider position", () => {
    for (let t = 1; t <= 99; t++) {
      for (let i = 0; i <= 100; i++) {
        expect(decide(i / 100, t / 100), `noul ${i}% @ threshold ${t}%`).toBe(i < t ? "block" : "allow");
      }
    }
  });

  it("raising the threshold never unblocks a page", () => {
    for (let i = 0; i <= 100; i++) {
      for (let t = 1; t < 99; t++) {
        if (decide(i / 100, t / 100) === "block") expect(decide(i / 100, (t + 1) / 100)).toBe("block");
      }
    }
  });
});

describe("thresholdRule", () => {
  it("names the configured threshold as a percentage", () => {
    expect(thresholdRule(0.5)).toBe("pages below 50% are blocked");
    expect(thresholdRule(0.35)).toBe("pages below 35% are blocked");
  });
});
