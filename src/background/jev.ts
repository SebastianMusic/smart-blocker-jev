import type { PagePayload } from "../shared/messages";
import type { CallOutcome } from "./guard";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
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

export async function askJev(
  apiKey: string,
  model: string,
  intention: string,
  page: PagePayload & { domain: string },
): Promise<JevResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, state: { user_intention: intention, page }, questions: QUESTIONS }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { outcome: "error", message: e instanceof Error ? e.message : String(e) };
  }

  if (res.status === 401 || res.status === 403) return { outcome: "auth", message: `HTTP ${res.status}` };
  if (res.status === 429) return { outcome: "rate-limited", message: "HTTP 429" };
  if (!res.ok) return { outcome: "error", message: `HTTP ${res.status}` };

  try {
    const body = (await res.json()) as { answers?: { matches_intention?: { noul?: unknown } } };
    const noul = body.answers?.matches_intention?.noul;
    if (typeof noul !== "number" || !(noul >= 0 && noul <= 1)) {
      return { outcome: "error", message: "unexpected response shape" };
    }
    return { outcome: "ok", noul };
  } catch {
    return { outcome: "error", message: "invalid JSON response" };
  }
}

export type Decision = "block" | "allow" | "uncertain";

export function decide(noul: number, blockBelow: number, allowAbove: number): Decision {
  if (noul < blockBelow) return "block";
  if (noul > allowAbove) return "allow";
  return "uncertain";
}
