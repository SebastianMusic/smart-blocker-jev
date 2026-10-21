/** Where page checks are sent. Any OpenAI-compatible-ish endpoint that answers the jev question shape works. */
export const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export interface Settings {
  enabled: boolean;
  /** hide every page behind a "verifying" screen until jev confirms it matches */
  strictMode: boolean;
  endpoint: string;
  /** optional — only sent when set */
  apiKey: string;
  model: string;
  intention: string;
  /** pages jev scores below this are blocked */
  threshold: number;
  allowDomains: string[];
  blockDomains: string[];
  neverCheckDomains: string[];
  minIntervalMs: number;
  maxCallsPerMinute: number;
  maxCallsPerDay: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  strictMode: false,
  endpoint: DEFAULT_ENDPOINT,
  apiKey: "",
  model: "jev-latest",
  intention: "",
  threshold: 0.3,
  allowDomains: [],
  blockDomains: [],
  neverCheckDomains: [
    "mail.google.com",
    "accounts.google.com",
    "outlook.live.com",
    "outlook.office.com",
    "login.microsoftonline.com",
    "mail.yahoo.com",
    "proton.me",
    "paypal.com",
  ],
  minIntervalMs: 100,
  maxCallsPerMinute: 120,
  maxCallsPerDay: 10_000,
};

/** Upper bounds on API usage that settings cannot exceed. */
export const HARD_LIMITS = {
  minIntervalMs: 100,
  maxCallsPerMinute: 120,
  maxCallsPerDay: 100_000,
} as const;

/** Changing any of these invalidates every cached verdict. */
export const VERDICT_KEYS = ["intention", "threshold", "model", "endpoint"] as const;

export async function loadSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await browser.storage.local.set({ settings: next });
  return next;
}

export function verdictInputsChanged(a: Settings, b: Settings): boolean {
  return VERDICT_KEYS.some((k) => a[k] !== b[k]);
}
