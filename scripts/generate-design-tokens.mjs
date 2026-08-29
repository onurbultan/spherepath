import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(projectRoot, "packages/shared/src/design/tokens.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const checkOnly = process.argv.includes("--check");

const kebab = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const declarations = (entries, indent) =>
  entries.map(([name, value]) => `${indent}${name}: ${value};`).join("\n");

const schemeEntries = (scheme) => [
  ...Object.entries(source.color[scheme]).map(([name, value]) => [`--${kebab(name)}`, value]),
  ...Object.entries(source.shadow[scheme]).map(([name, value]) => [`--shadow-${kebab(name)}`, value]),
];

const scaleEntries = () =>
  [
    ["space", "px"],
    ["radius", "px"],
    ["hit", "px"],
    ["control", "px"],
    ["motion", "ms"],
  ].flatMap(([group, unit]) =>
    Object.entries(source[group]).map(([name, value]) => [`--${group}-${kebab(name)}`, `${value}${unit}`]),
  );

// Three blocks so the viewer's system preference and an explicit `data-theme`
// choice both resolve: light is the unconditional base, the media query applies
// dark unless light was pinned, and the attribute selector wins either way.
const themeCss = `/* Generated from @spherepath/shared design tokens. Do not edit by hand. */
:root {
${declarations(schemeEntries("light"), "  ")}

${declarations(scaleEntries(), "  ")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${declarations(schemeEntries("dark"), "    ")}
  }
}

:root[data-theme="dark"] {
${declarations(schemeEntries("dark"), "  ")}
}
`;

const outputs = new Map([
  [
    resolve(projectRoot, "packages/shared/src/design/tokens.generated.ts"),
    `// Generated from tokens.json. Do not edit by hand.\nexport const designTokens = ${JSON.stringify(source, null, 2)} as const;\nexport type ColorScheme = keyof typeof designTokens.color;\nexport type ColorToken = keyof (typeof designTokens.color)["light"];\n\nexport function colorsForScheme(scheme: ColorScheme) {\n  return designTokens.color[scheme];\n}\n`,
  ],
  [
    resolve(projectRoot, "apps/mobile/src/shared/ui/tokens.generated.ts"),
    `// Generated from @spherepath/shared design tokens. Do not edit by hand.\nimport { designTokens, type ColorScheme } from "@spherepath/shared/design";\n\nexport function nativeTokens(scheme: ColorScheme) {\n  return designTokens.color[scheme];\n}\n\nexport const space = designTokens.space;\nexport const radius = designTokens.radius;\nexport const hit = designTokens.hit;\nexport const control = designTokens.control;\nexport const motion = designTokens.motion;\n`,
  ],
  [resolve(projectRoot, "apps/web/src/app/theme.generated.css"), themeCss],
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
