import { HARD_LIMITS, type Settings } from "../shared/settings";

export interface GuardState {
  /** timestamps of calls in the last minute */
  recent: number[];
  day: string;
  dayCount: number;
  consecutiveFailures: number;
  pausedUntil: number;
  pauseReason: string;
}

export interface Limits {
  minIntervalMs: number;
  maxCallsPerMinute: number;
  maxCallsPerDay: number;
}

export type Allowance = { ok: true } | { ok: false; reason: string };

export type CallOutcome = "ok" | "auth" | "rate-limited" | "error";

const FAILURES_BEFORE_PAUSE = 3;
const FAILURE_PAUSE_MS = 5 * 60_000;
const RATE_LIMIT_PAUSE_MS = 60_000;
/** Effectively "until the API key changes". */
const AUTH_PAUSE_MS = 365 * 24 * 3600_000;

export const emptyGuardState = (): GuardState => ({
  recent: [],
  day: "",
  dayCount: 0,
  consecutiveFailures: 0,
  pausedUntil: 0,
  pauseReason: "",
});

export function effectiveLimits(s: Pick<Settings, keyof Limits>): Limits {
  const num = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  return {
    minIntervalMs: Math.max(num(s.minIntervalMs, HARD_LIMITS.minIntervalMs), HARD_LIMITS.minIntervalMs),
    maxCallsPerMinute: Math.max(0, Math.min(num(s.maxCallsPerMinute, 0), HARD_LIMITS.maxCallsPerMinute)),
    maxCallsPerDay: Math.max(0, Math.min(num(s.maxCallsPerDay, 0), HARD_LIMITS.maxCallsPerDay)),
  };
}

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

export function checkAllowance(state: GuardState, limits: Limits, now: number): Allowance {
  if (now < state.pausedUntil) return { ok: false, reason: state.pauseReason || "paused" };
  const recent = state.recent.filter((t) => now - t < 60_000);
  const last = recent.at(-1);
  if (last !== undefined && now - last < limits.minIntervalMs) {
    return { ok: false, reason: "too many checks in quick succession" };
  }
  if (recent.length >= limits.maxCallsPerMinute) return { ok: false, reason: "per-minute limit reached" };
  const dayCount = state.day === dayOf(now) ? state.dayCount : 0;
  if (dayCount >= limits.maxCallsPerDay) return { ok: false, reason: "daily limit reached" };
  return { ok: true };
}

export function recordCall(state: GuardState, now: number): GuardState {
  const day = dayOf(now);
  return {
    ...state,
    recent: [...state.recent.filter((t) => now - t < 60_000), now],
    day,
    dayCount: (state.day === day ? state.dayCount : 0) + 1,
  };
}

export function recordOutcome(state: GuardState, outcome: CallOutcome, now: number): GuardState {
  switch (outcome) {
    case "ok":
      return { ...state, consecutiveFailures: 0 };
    case "auth":
      return { ...state, pausedUntil: now + AUTH_PAUSE_MS, pauseReason: "API key rejected; update it in settings" };
    case "rate-limited":
      return { ...state, pausedUntil: now + RATE_LIMIT_PAUSE_MS, pauseReason: "TypeSafe API rate limit hit" };
    case "error": {
      const failures = state.consecutiveFailures + 1;
      return failures >= FAILURES_BEFORE_PAUSE
        ? { ...state, consecutiveFailures: 0, pausedUntil: now + FAILURE_PAUSE_MS, pauseReason: "repeated API errors" }
        : { ...state, consecutiveFailures: failures };
    }
  }
}

/**
 * Persisted wrapper. The background event page can be unloaded at any time, so
 * the counters live in storage; a promise chain serialises read-modify-write.
 */
export class Guard {
  private chain: Promise<unknown> = Promise.resolve();

  private withState<T>(fn: (s: GuardState) => [GuardState, T]): Promise<T> {
    const run = this.chain.then(async () => {
      const { guard } = await browser.storage.local.get("guard");
      const [next, result] = fn({ ...emptyGuardState(), ...(guard as Partial<GuardState> | undefined) });
      await browser.storage.local.set({ guard: next });
      return result;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Atomically checks the limits and, if allowed, records the call. */
  acquire(limits: Limits): Promise<Allowance> {
    return this.withState((s) => {
      const now = Date.now();
      const allowance = checkAllowance(s, limits, now);
      return [allowance.ok ? recordCall(s, now) : s, allowance];
    });
  }

  report(outcome: CallOutcome): Promise<void> {
    return this.withState((s) => [recordOutcome(s, outcome, Date.now()), undefined]);
  }

  resume(): Promise<void> {
    return this.withState((s) => [{ ...s, pausedUntil: 0, pauseReason: "", consecutiveFailures: 0 }, undefined]);
  }

  snapshot(): Promise<GuardState> {
    return this.withState((s) => [s, s]);
  }
}
