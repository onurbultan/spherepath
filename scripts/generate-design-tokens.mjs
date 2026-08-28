import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(projectRoot, "packages/shared/src/design/tokens.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const checkOnly = process.argv.includes("--check");

const kebab = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const cssBlock = (palette, indent = "  ") =>
  Object.entries(palette)
    .map(([name, value]) => `${indent}--${kebab(name)}: ${value};`)
    .join("\n");

const outputs = new Map([
  [
    resolve(projectRoot, "packages/shared/src/design/tokens.generated.ts"),
    `// Generated from tokens.json. Do not edit by hand.\nexport const designTokens = ${JSON.stringify(source, null, 2)} as const;\nexport type ColorScheme = keyof typeof designTokens.color;\nexport type ColorToken = keyof (typeof designTokens.color)["light"];\n\nexport function colorsForScheme(scheme: ColorScheme) {\n  return designTokens.color[scheme];\n}\n`,
  ],
  [
    resolve(projectRoot, "apps/mobile/src/shared/ui/tokens.generated.ts"),
    `// Generated from @spherepath/shared design tokens. Do not edit by hand.\nimport { designTokens, type ColorScheme } from "@spherepath/shared/design";\n\nexport function nativeTokens(scheme: ColorScheme) {\n  return designTokens.color[scheme];\n}\n\nexport const space = designTokens.space;\nexport const radius = designTokens.radius;\nexport const hit = designTokens.hit;\n`,
  ],
  [
    resolve(projectRoot, "apps/web/src/app/theme.generated.css"),
    `/* Generated from @spherepath/shared design tokens. Do not edit by hand. */\n:root {\n${cssBlock(source.color.light)}\n}\n\n@media (prefers-color-scheme: dark) {\n  :root {\n${cssBlock(source.color.dark, "    ")}\n  }\n}\n`,
  ],
]);

let stale = false;
for (const [path, expected] of outputs) {
  const current = await readFile(path, "utf8").catch(() => "");
  if (current === expected) continue;
  stale = true;
  if (!checkOnly) await writeFile(path, expected);
}

if (checkOnly && stale) {
  console.error("Generated design tokens are stale. Run pnpm design:generate.");
  process.exitCode = 1;
} else if (!checkOnly) {
  console.log("Spherepath design tokens generated.");
}
