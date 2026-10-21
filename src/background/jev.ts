import type { PagePayload } from "../shared/messages";
import type { CallOutcome } from "./guard";

const TIMEOUT_MS = 8000;

const QUESTIONS = {
  matches_intention: {
    type: "noul",
    instructions:
      "Is visiting the web page described in `page` consistent with `user_intention`, " +
      "the user's own statement of how they want to use the internet right now?",
    criteria: {
      true:
        "The page serves what the user intends to do, or is a neutral step toward it " +
        "(for example a search, login, or reference page used for that purpose).",
      false: "The page is unrelated to what the user intends, or is a distraction the user wants to avoid.",
    },
  },
};

export type JevResult =
  | { outcome: "ok"; noul: number }
  | { outcome: Exclude<CallOutcome, "ok">; message: string };

/** What went over the wire, minus the API key, for the debug log. */
export interface JevTrace {
  request: unknown;
  status: number | null;
  response: string;
  ms: number;
}

export async function askJev(
  endpoint: string,
  apiKey: string,
  model: string,
  intention: string,
  page: PagePayload & { domain: string },
): Promise<JevResult & { trace: JevTrace }> {
  const request = { model, state: { user_intention: intention, page }, questions: QUESTIONS };
  const started = performance.now();
  const trace: JevTrace = { request, status: null, response: "", ms: 0 };
  const done = (r: JevResult) => ({ ...r, trace: { ...trace, ms: Math.round(performance.now() - started) } });

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    trace.status = res.status;
    trace.response = await res.text();
  } catch (e) {
    return done({ outcome: "error", message: e instanceof Error ? e.message : String(e) });
  }

  if (res.status === 401 || res.status === 403) return done({ outcome: "auth", message: `HTTP ${res.status}` });
  if (res.status === 429) return done({ outcome: "rate-limited", message: "HTTP 429" });
  if (!res.ok) return done({ outcome: "error", message: `HTTP ${res.status}` });

  try {
    const body = JSON.parse(trace.response) as { answers?: { matches_intention?: { noul?: unknown } } };
    const noul = body.answers?.matches_intention?.noul;
    if (typeof noul !== "number" || !(noul >= 0 && noul <= 1)) {
      return done({ outcome: "error", message: "unexpected response shape" });
    }
    return done({ outcome: "ok", noul });
  } catch {
    return done({ outcome: "error", message: "invalid JSON response" });
  }
}
