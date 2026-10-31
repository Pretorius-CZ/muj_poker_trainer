/**
 * Build pro web: z engine/src/*.ts udělá browser-ready JS.
 *
 * Proč vlastní build a ne Vite: projekt je záměrně bez závislostí a Node 24
 * umí TypeScript stripovat nativně (`stripTypeScriptTypes`). Výsledek je
 * obyčejné ESM, které prohlížeč načte přímo — žádný bundler, žádný install.
 *
 * Co se musí ručně doladit:
 *   - importy mají v TS příponu `.ts`, v prohlížeči musí být `.js`;
 *   - type-only importy stripování odstraní samo.
 *
 * Spuštění: node tools/build-web.mjs
 */

import { stripTypeScriptTypes } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "engine", "src");
const outputDir = join(root, "web", "engine");

/** Jen moduly, které prohlížeč potřebuje. Simulace a CLI do něj nepatří. */
const MODULES = [
  "cards",
  "rng",
  "evaluator",
  "pots",
  "hand",
  "table",
  "bots",
  "range",
  "equity",
  "strength",
  "archetypes",
  "presets",
];

await mkdir(outputDir, { recursive: true });

for (const name of MODULES) {
  const source = await readFile(join(sourceDir, `${name}.ts`), "utf8");
  let js = stripTypeScriptTypes(source, { mode: "strip" });

  // "../../x.ts" → "../../x.js"
  js = js.replace(/(\bfrom\s*["'][^"']+)\.ts(["'])/g, "$1.js$2");

  const banner =
    `// GENEROVÁNO z engine/src/${name}.ts — neupravuj přímo.\n` +
    `// Znovu vygeneruješ: node tools/build-web.mjs\n\n`;

  await writeFile(join(outputDir, `${name}.js`), banner + js, "utf8");
}

console.log(`✓ ${MODULES.length} modulů → web/engine/`);
