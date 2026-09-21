/** A format-neutral settings document: nested plain objects, arrays, strings, numbers and booleans. */
export type ConfigDocument = Record<string, unknown>;

/**
 * A text format settings can be exported to and imported from.
 * To support a new format, implement this and add it to FORMATS in ./index.ts.
 */
export interface ConfigFormat {
  id: string;
  label: string;
  /** file extensions including the dot; the first is used for exports */
  extensions: readonly string[];
  mimeType: string;
  /** `header` is a human note; formats without comments may drop it */
  serialize(doc: ConfigDocument, header: string): string;
  /** throws on syntax errors */
  parse(text: string): unknown;
}
