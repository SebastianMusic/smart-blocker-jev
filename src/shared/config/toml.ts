import { parse, stringify } from "smol-toml";
import type { ConfigFormat } from "./format";

export const tomlFormat: ConfigFormat = {
  id: "toml",
  label: "TOML",
  extensions: [".toml"],
  mimeType: "application/toml",
  serialize(doc, header) {
    const comment = header
      .split("\n")
      .map((line) => `# ${line}`.trimEnd())
      .join("\n");
    return `${comment}\n\n${stringify(doc)}`;
  },
  parse: (text) => parse(text),
};
