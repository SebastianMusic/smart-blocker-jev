import type { Settings } from "../settings";
import type { ConfigFormat } from "./format";
import { documentToSettings, settingsToDocument, type ImportResult } from "./schema";
import { tomlFormat } from "./toml";

export type { ConfigFormat } from "./format";
export type { ImportResult } from "./schema";

export const FORMATS: readonly ConfigFormat[] = [tomlFormat];
export const DEFAULT_FORMAT = tomlFormat;

export function formatForFile(filename: string): ConfigFormat | undefined {
  const lower = filename.toLowerCase();
  return FORMATS.find((f) => f.extensions.some((ext) => lower.endsWith(ext)));
}

export function exportSettings(
  settings: Settings,
  opts: { includeApiKey: boolean; format?: ConfigFormat; now?: Date },
): { filename: string; content: string; mimeType: string } {
  const format = opts.format ?? DEFAULT_FORMAT;
  const header =
    `Smart Blocker Jev settings, exported ${(opts.now ?? new Date()).toISOString()}\n` +
    `Import this file from the extension's settings page. Settings left out keep their current value.` +
    (opts.includeApiKey ? "\nContains your TypeSafe API key: don't share it." : "");
  return {
    filename: `smart-blocker-jev-settings${format.extensions[0]}`,
    content: format.serialize(settingsToDocument(settings, opts), header),
    mimeType: format.mimeType,
  };
}

export function importSettings(text: string, format: ConfigFormat = DEFAULT_FORMAT): ImportResult {
  let doc: unknown;
  try {
    doc = format.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return { settings: {}, errors: [`Could not read the ${format.label} file: ${msg}`], warnings: [] };
  }
  return documentToSettings(doc);
}
