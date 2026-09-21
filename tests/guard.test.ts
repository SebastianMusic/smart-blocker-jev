import { describe, expect, it } from "vitest";
import { checkAllowance, effectiveLimits, emptyGuardState, recordCall, recordOutcome } from "../src/background/guard";
import { DEFAULT_SETTINGS, HARD_LIMITS } from "../src/shared/settings";

const limits = { minIntervalMs: 1000, maxCallsPerMinute: 3, maxCallsPerDay: 5 };
const T0 = Date.UTC(2026, 8, 21, 12, 0, 0);

describe("guard", () => {
  it("allows the first call", () => {
    expect(checkAllowance(emptyGuardState(), limits, T0)).toEqual({ ok: true });
  });

  it("refuses calls in quick succession", () => {
    const s = recordCall(emptyGuardState(), T0);
    expect(checkAllowance(s, limits, T0 + 500).ok).toBe(false);
    expect(checkAllowance(s, limits, T0 + 1000).ok).toBe(true);
  });

  it("enforces the per-minute limit and frees slots after a minute", () => {
    let s = emptyGuardState();
    for (let i = 0; i < 3; i++) s = recordCall(s, T0 + i * 2000);
    expect(checkAllowance(s, limits, T0 + 10_000)).toEqual({ ok: false, reason: "per-minute limit reached" });
    expect(checkAllowance(s, limits, T0 + 61_000).ok).toBe(true);
  });

  it("enforces the daily limit and resets on a new day", () => {
    let s = emptyGuardState();
    for (let i = 0; i < 5; i++) s = recordCall(s, T0 + i * 120_000);
    expect(checkAllowance(s, limits, T0 + 3_600_000)).toEqual({ ok: false, reason: "daily limit reached" });
    expect(checkAllowance(s, limits, T0 + 24 * 3_600_000).ok).toBe(true);
  });

  it("pauses after repeated errors and resets the streak on success", () => {
    let s = emptyGuardState();
    s = recordOutcome(s, "error", T0);
    s = recordOutcome(s, "ok", T0);
    expect(s.consecutiveFailures).toBe(0);
    for (let i = 0; i < 3; i++) s = recordOutcome(s, "error", T0);
    expect(checkAllowance(s, limits, T0 + 60_000).ok).toBe(false);
    expect(checkAllowance(s, limits, T0 + 5 * 60_000 + 1).ok).toBe(true);
  });

  it("pauses indefinitely on auth failure", () => {
    const s = recordOutcome(emptyGuardState(), "auth", T0);
    expect(checkAllowance(s, limits, T0 + 30 * 24 * 3_600_000).ok).toBe(false);
  });

  it("uses the default limits unclamped", () => {
    expect(effectiveLimits(DEFAULT_SETTINGS)).toEqual({ minIntervalMs: 100, maxCallsPerMinute: 120, maxCallsPerDay: 10_000 });
  });

  it("clamps user limits to hard ceilings", () => {
    const e = effectiveLimits({ minIntervalMs: 0, maxCallsPerMinute: 1e6, maxCallsPerDay: NaN });
    expect(e).toEqual({
      minIntervalMs: HARD_LIMITS.minIntervalMs,
      maxCallsPerMinute: HARD_LIMITS.maxCallsPerMinute,
      maxCallsPerDay: 0,
    });
  });
});
