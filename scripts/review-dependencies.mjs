import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

function packageRuntime(text) {
  return Object.keys(JSON.parse(text).dependencies ?? {}).sort();
}

function cargoRuntime(text) {
  const lines = text.split(/\r?\n/);
  const names = [];
  let active = false;
  for (const line of lines) {
    if (line === "[dependencies]") { active = true; continue; }
    if (active && line.startsWith("[")) break;
    const match = active ? line.match(/^([A-Za-z0-9_-]+)\s*=/) : null;
    if (match) names.push(match[1]);
  }
  return names.sort();
}

const packageAfter = packageRuntime(read("package.json"));
const cargoAfter = cargoRuntime(read("src-tauri/Cargo.toml"));
const baseline = JSON.parse(read("tests/fixtures/release-v1/dependency-baseline.json"));

assert.deepEqual(packageAfter, baseline.npm, "frontend runtime dependencies differ from approved baseline");
assert.deepEqual(cargoAfter, baseline.cargo, "Rust runtime dependencies differ from approved baseline");

console.log(JSON.stringify({
  review: "accelerated-v1-direct-runtime-dependencies",
  status: "passed",
  approvedAt: baseline.approvedAt,
  current: { npm: packageAfter.length, cargo: cargoAfter.length },
  reviewed: baseline.acceleratedQueueReviewedAdditions,
}, null, 2));
