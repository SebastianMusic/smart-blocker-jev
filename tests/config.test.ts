import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportSettings, FORMATS, formatForFile, importSettings } from "../src/shared/config";
import { FIELDS } from "../src/shared/config/schema";
import { DEFAULT_SETTINGS, HARD_LIMITS, type Settings } from "../src/shared/settings";

const custom: Settings = {
  ...DEFAULT_SETTINGS,
  apiKey: "ts_secret_123",
  intention: 'Learning about "Buddhism"\nand meditation',
  threshold: 0.42,
  strictMode: true,
  allowDomains: ["wikipedia.org", "/^docs\\./"],
  blockDomains: ["/youtube\\.com\\/shorts/", "/a{1,3}, b/"],
  maxCallsPerDay: 20_000,
};

const roundTrip = (s: Settings, includeApiKey: boolean) =>
  importSettings(exportSettings(s, { includeApiKey }).content);

describe("config export", () => {
  it("writes a commented TOML file with one section per group", () => {
    const { content, filename, mimeType } = exportSettings(DEFAULT_SETTINGS, { includeApiKey: false });
    expect(filename).toBe("smart-blocker-jev-settings.toml");
    expect(mimeType).toBe("application/toml");
    expect(content).toMatch(/^# Smart Blocker Jev settings/);
    expect(content).toContain("version = 1");
    for (const section of ["[general]", "[api]", "[rules]", "[limits]"]) expect(content).toContain(section);
  });

  it("leaves the API key out unless asked", () => {
    expect(exportSettings(custom, { includeApiKey: false }).content).not.toContain("ts_secret_123");
    const withKey = exportSettings(custom, { includeApiKey: true }).content;
    expect(withKey).toContain("ts_secret_123");
    expect(withKey).toContain("don't share it");
  });

  it("covers every setting", () => {
    const keys = new Set(FIELDS.map((f) => f.key));
    expect([...keys].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });
});

describe("config round trip", () => {
  it("restores every setting exactly, including awkward strings and regexes", () => {
    const r = roundTrip(custom, true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.settings).toEqual(custom);
  });

  it("restores everything except the key when the key is left out", () => {
    const { apiKey: _, ...rest } = custom;
    expect(roundTrip(custom, false).settings).toEqual(rest);
  });
});

describe("config import", () => {
  it("imports a partial file, touching only the settings it contains", () => {
    const r = importSettings('[general]\nthreshold = 0.8\n\n[rules]\nalways_block = ["Reddit.com"]\n');
    expect(r.errors).toEqual([]);
    expect(r.settings).toEqual({ threshold: 0.8, blockDomains: ["reddit.com"] });
  });

  it("accepts a file without a version", () => {
    expect(importSettings("[general]\nenabled = false\n").settings).toEqual({ enabled: false });
  });

  it("reports syntax errors without changing anything", () => {
    const r = importSettings("[general\nthreshold = ");
    expect(r.settings).toEqual({});
    expect(r.errors[0]).toMatch(/^Could not read the TOML file/);
  });

  it("reports every invalid value and imports nothing", () => {
    const r = importSettings(
      [
        "[general]",
        'threshold = 1.5',
        'enabled = "yes"',
        "[api]",
        'model = "  "',
        "[rules]",
        'always_block = ["/(unclosed/"]',
        'never_check = "bank.com"',
        "[limits]",
        "max_calls_per_day = 1.5",
        "[general_typo]",
      ].join("\n"),
    );
    expect(r.settings).toEqual({});
    expect(r.errors).toHaveLength(6);
    expect(r.errors.join("\n")).toContain("`general.threshold` must be a number between 0 and 1");
    expect(r.errors.join("\n")).toContain("`general.enabled` must be true or false");
    expect(r.errors.join("\n")).toContain("`api.model` must not be empty");
    expect(r.errors.join("\n")).toContain("`rules.always_block` has invalid patterns: /(unclosed/");
    expect(r.errors.join("\n")).toContain("`rules.never_check` must be a list of strings");
    expect(r.errors.join("\n")).toContain("`limits.max_calls_per_day` must be a whole number");
  });

  it("rejects an endpoint that is not an http(s) URL", () => {
    expect(importSettings('[api]\nendpoint = "ftp://host/x"').errors).toEqual(["`api.endpoint` must be an http(s) URL"]);
    expect(importSettings('[api]\nendpoint = "not a url"').errors).toEqual(["`api.endpoint` is not a valid URL"]);
    const ok = importSettings('[api]\nendpoint = "http://localhost:8080/v1/systemone"');
    expect(ok.settings.endpoint).toBe("http://localhost:8080/v1/systemone");
  });

  it("warns about unknown settings but still imports the rest", () => {
    const r = importSettings("colour = 1\n[general]\nthreshold = 0.6\nthresold = 0.9\n[extras]\na = 1\n");
    expect(r.errors).toEqual([]);
    expect(r.settings).toEqual({ threshold: 0.6 });
    expect(r.warnings).toEqual([
      "Unknown setting `colour` ignored",
      "Unknown setting `general.thresold` ignored",
      "Unknown setting `extras` ignored",
    ]);
  });

  it("warns when limits will be capped by the hard ceilings", () => {
    const r = importSettings("[limits]\nmax_calls_per_minute = 1000\nmin_interval_ms = 10\n");
    expect(r.errors).toEqual([]);
    expect(r.warnings.join("\n")).toContain(`capped at ${HARD_LIMITS.maxCallsPerMinute}`);
    expect(r.warnings.join("\n")).toContain(`raised to ${HARD_LIMITS.minIntervalMs}`);
  });

  it("rejects files from a newer version", () => {
    expect(importSettings("version = 2\n").errors[0]).toMatch(/version 2/);
  });

  it("rejects a section that isn't a table", () => {
    expect(importSettings('general = "x"\n').errors).toEqual(["`general` must be a section"]);
  });
});

describe("format registry", () => {
  it("finds the format by file extension, case-insensitively", () => {
    expect(formatForFile("backup.TOML")?.id).toBe("toml");
    expect(formatForFile("backup.json")).toBeUndefined();
    expect(FORMATS.map((f) => f.id)).toContain("toml");
  });
});

describe("user guide", () => {
  it("has a TOML example that imports cleanly", () => {
    const guide = readFileSync(new URL("../docs/user-guide.md", import.meta.url), "utf8");
    const example = /```toml\n([\s\S]*?)```/.exec(guide)?.[1];
    expect(example).toBeDefined();
    const r = importSettings(example!);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.settings.blockDomains).toEqual(["/youtube\\.com\\/shorts/", "tiktok.com"]);
  });
});
