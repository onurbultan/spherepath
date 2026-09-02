#!/usr/bin/env node
// Web and mobile are meant to be the same product on two screens. Nothing here
// judges design; it only catches the three ways the two builds have actually
// drifted apart before, each of which was invisible until someone went looking.
//
// An exception is allowed, but it has to be written down with a reason: the
// point is that a difference between the platforms becomes a decision rather
// than an accident.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Deliberate differences. A name here needs a reason that survives review. */
const allowed = {
  web: {
    // Public pages required by the stores and by KVKK; not app screens.
  },
  mobile: {
    // Nothing yet. Notification scheduling has no callable of its own.
  },
};

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.tsx?$/u.test(path)) files.push(path);
  }
  return files;
}

function callableNames(root) {
  const names = new Map();
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/apiClient\.(?:query|command)(?:<[^>]*>)?\(\s*"([a-zA-Z]+)"/gu)) {
      if (!names.has(match[1])) names.set(match[1], file);
    }
  }
  return names;
}

const problems = [];

// 1. Every server capability one platform reaches, the other reaches too.
const web = callableNames("apps/web/src");
const mobile = callableNames("apps/mobile/src");

for (const name of web.keys()) {
  if (!mobile.has(name) && !(name in allowed.mobile)) {
    problems.push(`${name}: web'de çağrılıyor, mobilde yok (${web.get(name)})`);
  }
}
for (const name of mobile.keys()) {
  if (!web.has(name) && !(name in allowed.web)) {
    problems.push(`${name}: mobilde çağrılıyor, web'de yok (${mobile.get(name)})`);
  }
}

// 2. A mobile screen must not name its own control height. The metrics behind a
//    field, a choice and an action live in shared/ui/SpField.
const controlKeys = /(?<![\w.])(input|choice|primary|secondary|textarea): \{([^{}]*)\}/gu;
for (const file of walk("apps/mobile/src")) {
  if (file.endsWith("SpField.tsx")) continue;
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(controlKeys)) {
    const body = match[2];
    if (body.includes("Metrics")) continue;
    if (!/minHeight|borderRadius|paddingHorizontal/u.test(body)) continue;
    problems.push(`${file}: "${match[1]}" kendi ölçüsünü yazıyor; controlMetrics/choiceMetrics/buttonMetrics kullanın`);
  }
}

// 3. On web, a form control looks the way it does because of what it is. A rule
//    that styles controls by where they sit is how the drift started.
const css = readFileSync("apps/web/src/app/globals.css", "utf8");
const contextual = css.match(/^\.[\w-]+ (input|select|textarea)[^{]*\{[^}]*\}/gmu) ?? [];
for (const rule of contextual) {
  const [selector, body] = [rule.split("{")[0].trim(), rule.slice(rule.indexOf("{"))];
  // Adjusting a property or two is what a variant is for, and stripping a border
  // is how the inner half of a composite control is written. The drift is a rule
  // that dresses a control from nothing -- giving it a real border and a real
  // ground -- because then its appearance depends on where it sits.
  const dressed = /border: [^;]*(?<!0)(?<!none);/u.test(body)
    && /background: (?!transparent|none)[^;]+;/u.test(body);
  if (!dressed) continue;
  // These are deliberately not form fields: an inline badge, a compact filter,
  // a note composer, a search box that carries its own chrome.
  if (/\.(location-form|quick-note|keep-kind|voice-text-test|opportunity-filterbar|contact-toolbar|contact-combobox)/u.test(selector)) continue;
  problems.push(`globals.css: "${selector}" kontrolü sıfırdan biçimlendiriyor; .sp-control kullanın`);
}

if (problems.length) {
  console.error("\nPlatform paritesi bozuldu:\n");
  for (const problem of problems) console.error(`  · ${problem}`);
  console.error("\nKasıtlıysa scripts/check-platform-parity.mjs içindeki listeye gerekçesiyle ekleyin.\n");
  process.exit(1);
}

console.log(`Platform paritesi korunuyor · ${web.size} sunucu fonksiyonu iki platformda da çağrılıyor.`);
