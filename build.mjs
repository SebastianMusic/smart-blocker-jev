import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");

await rm("dist", { recursive: true, force: true });
await mkdir("dist/pages", { recursive: true });

const copyStatic = async () => {
  await cp("src/manifest.json", "dist/manifest.json");
  await cp("src/icons", "dist/icons", { recursive: true });
  for (const f of ["popup.html", "options.html", "blocked.html", "pages.css"]) {
    await cp(`src/pages/${f}`, `dist/pages/${f}`);
  }
};

const options = {
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    "pages/popup": "src/pages/popup.ts",
    "pages/options": "src/pages/options.ts",
    "pages/blocked": "src/pages/blocked.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "firefox140",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  plugins: [{ name: "static", setup: (b) => b.onEnd(copyStatic) }],
};

if (watch) {
  await (await esbuild.context(options)).watch();
} else {
  await esbuild.build(options);
}
