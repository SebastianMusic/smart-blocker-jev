import { HARD_LIMITS, type Settings } from "../settings";
import { isRegexRule, parseRuleList, regexRuleError } from "../url";
import type { ConfigDocument } from "./format";

export const CONFIG_VERSION = 1;

type Check = (v: unknown, path: string) => { value: unknown; warning?: string } | { error: string };

interface Field {
  key: keyof Settings;
  section: string;
  name: string;
  check: Check;
  /** left out of exports unless explicitly requested */
  secret?: boolean;
}

const bool: Check = (v, path) => (typeof v === "boolean" ? { value: v } : { error: `\`${path}\` must be true or false` });

const text =
  (opts: { nonEmpty?: boolean } = {}): Check =>
  (v, path) => {
    if (typeof v !== "string") return { error: `\`${path}\` must be a string` };
    if (opts.nonEmpty && !v.trim()) return { error: `\`${path}\` must not be empty` };
    return { value: v.trim() };
  };

const num =
  (opts: { min: number; max?: number; integer?: boolean; softMin?: number; softMax?: number }): Check =>
  (v, path) => {
    const inRange = typeof v === "number" && Number.isFinite(v) && v >= opts.min && (opts.max === undefined || v <= opts.max);
    if (!inRange || (opts.integer && !Number.isInteger(v))) {
      const kind = opts.integer ? "a whole number" : "a number";
      const range = opts.max === undefined ? `of at least ${opts.min}` : `between ${opts.min} and ${opts.max}`;
      return { error: `\`${path}\` must be ${kind} ${range}` };
    }
    if (opts.softMax !== undefined && v > opts.softMax) {
      return { value: v, warning: `\`${path}\` = ${v} is above the maximum and will be capped at ${opts.softMax}` };
    }
    if (opts.softMin !== undefined && v < opts.softMin) {
      return { value: v, warning: `\`${path}\` = ${v} is below the minimum and will be raised to ${opts.softMin}` };
    }
    return { value: v };
  };

const endpointUrl: Check = (v, path) => {
  if (typeof v !== "string") return { error: `\`${path}\` must be a string` };
  const value = v.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: `\`${path}\` is not a valid URL` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: `\`${path}\` must be an http(s) URL` };
  }
  return { value };
};

const rules: Check = (v, path) => {
  if (!Array.isArray(v) || v.some((r) => typeof r !== "string")) return { error: `\`${path}\` must be a list of strings` };
  const parsed = parseRuleList(v.join("\n"));
  const bad = parsed.filter((r) => isRegexRule(r) && regexRuleError(r) !== null);
  if (bad.length > 0) return { error: `\`${path}\` has invalid patterns: ${bad.map((r) => `${r} (${regexRuleError(r)})`).join(", ")}` };
  return { value: parsed };
};

/** Single source of truth for the file layout. Order here is the order in exported files. */
export const FIELDS: readonly Field[] = [
  { key: "enabled", section: "general", name: "enabled", check: bool },
  { key: "intention", section: "general", name: "intention", check: text() },
  { key: "threshold", section: "general", name: "threshold", check: num({ min: 0, max: 1 }) },
  { key: "strictMode", section: "general", name: "strict_mode", check: bool },
  { key: "endpoint", section: "api", name: "endpoint", check: endpointUrl },
  { key: "apiKey", section: "api", name: "key", check: text(), secret: true },
  { key: "model", section: "api", name: "model", check: text({ nonEmpty: true }) },
  { key: "providerName", section: "api", name: "provider_name", check: text() },
  { key: "allowDomains", section: "rules", name: "always_allow", check: rules },
  { key: "blockDomains", section: "rules", name: "always_block", check: rules },
  { key: "neverCheckDomains", section: "rules", name: "never_check", check: rules },
  {
    key: "minIntervalMs",
    section: "limits",
    name: "min_interval_ms",
    check: num({ min: 0, integer: true, softMin: HARD_LIMITS.minIntervalMs }),
  },
  {
    key: "maxCallsPerMinute",
    section: "limits",
    name: "max_calls_per_minute",
    check: num({ min: 0, integer: true, softMax: HARD_LIMITS.maxCallsPerMinute }),
  },
  {
    key: "maxCallsPerDay",
    section: "limits",
    name: "max_calls_per_day",
    check: num({ min: 0, integer: true, softMax: HARD_LIMITS.maxCallsPerDay }),
  },
];

const isTable = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function settingsToDocument(s: Settings, opts: { includeApiKey: boolean }): ConfigDocument {
  const doc: ConfigDocument = { version: CONFIG_VERSION };
  for (const f of FIELDS) {
    if (f.secret && !opts.includeApiKey) continue;
    const section = (doc[f.section] ??= {}) as Record<string, unknown>;
    section[f.name] = s[f.key];
  }
  return doc;
}

export interface ImportResult {
  /** only the settings present in the document; empty when there are errors */
  settings: Partial<Settings>;
  errors: string[];
  warnings: string[];
}

export function documentToSettings(doc: unknown): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const settings: Record<string, unknown> = {};

  if (!isTable(doc)) return { settings: {}, errors: ["The file does not contain a settings table"], warnings };

  const version = doc.version ?? CONFIG_VERSION;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    errors.push("`version` must be a whole number");
  } else if (version > CONFIG_VERSION) {
    errors.push(`This file is version ${version}, but this extension only understands up to version ${CONFIG_VERSION}`);
  }

  const known = new Map(FIELDS.map((f) => [`${f.section}.${f.name}`, f]));
  const sections = new Set(FIELDS.map((f) => f.section));

  for (const [sectionName, section] of Object.entries(doc)) {
    if (sectionName === "version") continue;
    if (!sections.has(sectionName)) {
      warnings.push(`Unknown setting \`${sectionName}\` ignored`);
      continue;
    }
    if (!isTable(section)) {
      errors.push(`\`${sectionName}\` must be a section`);
      continue;
    }
    for (const [name, value] of Object.entries(section)) {
      const path = `${sectionName}.${name}`;
      const field = known.get(path);
      if (!field) {
        warnings.push(`Unknown setting \`${path}\` ignored`);
        continue;
      }
      const r = field.check(value, path);
      if ("error" in r) {
        errors.push(r.error);
      } else {
        settings[field.key] = r.value;
        if (r.warning) warnings.push(r.warning);
      }
    }
  }

  return { settings: errors.length > 0 ? {} : (settings as Partial<Settings>), errors, warnings };
}
