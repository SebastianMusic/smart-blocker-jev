import type { PagePayload } from "../shared/messages";
import type { PromptText } from "../shared/prompt";
import type { CallOutcome } from "./guard";

const TIMEOUT_MS = 8000;

/** The words stored in settings, shaped into the noul question the endpoint expects. */
export function buildQuestions(p: PromptText) {
  return {
    matches_intention: {
      type: "noul",
      instructions: p.instructions,
      criteria: { true: p.criteriaTrue, false: p.criteriaFalse },
    },
  } as const;
}

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
  prompt: PromptText,
): Promise<JevResult & { trace: JevTrace }> {
  const request = { model, state: { user_intention: intention, page }, questions: buildQuestions(prompt) };
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
