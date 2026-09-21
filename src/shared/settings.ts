export interface Settings {
  enabled: boolean;
  apiKey: string;
  model: string;
  intention: string;
  /** noul below this blocks the page */
  blockBelow: number;
  /** noul above this allows the page and caches the verdict */
  allowAbove: number;
  allowDomains: string[];
  blockDomains: string[];
  neverCheckDomains: string[];
  minIntervalMs: number;
  maxCallsPerMinute: number;
  maxCallsPerDay: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  apiKey: "",
  model: "jev-latest",
  intention: "",
  blockBelow: 0.3,
  allowAbove: 0.7,
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
  minIntervalMs: 1000,
  maxCallsPerMinute: 10,
  maxCallsPerDay: 500,
};

/** Upper bounds on API usage that settings cannot exceed. */
export const HARD_LIMITS = {
  minIntervalMs: 500,
  maxCallsPerMinute: 30,
  maxCallsPerDay: 3000,
} as const;

/** Changing any of these invalidates every cached verdict. */
export const VERDICT_KEYS = ["intention", "blockBelow", "allowAbove", "model"] as const;

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
