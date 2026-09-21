export interface PagePayload {
  url: string;
  title: string;
  lang: string;
  description: string;
  og_type: string;
  og_site_name: string;
  canonical: string;
  schema_types: string[];
  headings: string[];
  flags: {
    password: boolean;
    form_action_domains: string[];
    outbound_link_domains: string[];
    third_party_scripts: number;
  };
  text: string;
}

export type TabState =
  | "checking"
  | "allowed"
  | "blocked"
  | "skipped"
  | "rate-limited"
  | "error";

export interface TabStatus {
  url: string;
  state: TabState;
  noul?: number;
  detail: string;
}

export interface Stats {
  cachedVerdicts: number;
  blockedCount: number;
  callsToday: number;
  pausedUntil: number;
  pauseReason: string;
}

export type Message =
  | { type: "page-ready"; url: string }
  | { type: "extract" }
  | { type: "status"; tabId: number }
  | { type: "flush" }
  | { type: "resume" }
  // strict mode: overlay <-> background
  | { type: "cover-check"; url: string }
  | { type: "cover" }
  | { type: "reveal"; url: string }
  | { type: "unverified"; url: string; detail: string }
  | { type: "unmute" };

export interface StatusResponse {
  tab: TabStatus | null;
  stats: Stats;
}
