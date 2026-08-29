#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/with-java21.mjs <command> [...args]");
  process.exit(1);
}

const candidates = [
  process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", "java") : undefined,
  "java",
  "/opt/homebrew/opt/openjdk@21/bin/java",
  "/usr/local/opt/openjdk@21/bin/java",
  "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java",
].filter(Boolean);

function javaMajor(javaBinary) {
  const result = spawnSync(javaBinary, ["-version"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = output.match(/version "(\d+)/);
  return result.status === 0 && match ? Number(match[1]) : null;
}

const javaBinary = candidates.find((candidate) => {
  const major = javaMajor(candidate);
  return major !== null && major >= 21;
});

if (!javaBinary) {
  console.error("Firebase emülatörleri için Java 21 veya daha yenisi bulunamadı.");
  process.exit(1);
}

const javaBin = javaBinary === "java" ? undefined : dirname(javaBinary);
const javaHome = javaBin ? dirname(javaBin) : process.env.JAVA_HOME;
const child = spawnSync(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(javaBin ? { PATH: `${javaBin}:${process.env.PATH ?? ""}` } : {}),
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  },
});

if (child.error) {
  console.error(child.error.message);
  process.exit(1);
}

process.exit(child.status ?? 1);
