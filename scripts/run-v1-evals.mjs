import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const fixture = join(root, "tests", "fixtures", "golden-v1");
const temp = mkdtempSync(join(tmpdir(), "atlas-golden-v1-"));
const buggy = "sum + line.price";
const fixed = "sum + line.price * line.quantity";

function runNarrowTest() {
  return spawnSync(process.execPath, ["--test", "test/cart.test.mjs"], {
    cwd: temp,
    encoding: "utf8",
  });
}

try {
  cpSync(fixture, temp, { recursive: true });
  const sourcePath = join(temp, "src", "cart.mjs");
  const before = readFileSync(sourcePath, "utf8");
  assert.match(before, /export function calculateTotal/);
  assert.equal(before.match(/calculateTotal/g)?.length, 2, "expected one definition and one reference");

  const failing = runNarrowTest();
  assert.notEqual(failing.status, 0, "golden fixture must prove the bug before editing");

  const after = before.replace(buggy, fixed);
  assert.notEqual(after, before, "expected one narrow correction");
  assert.equal(after.split("\n").filter((line, index) => line !== before.split("\n")[index]).length, 1);
  writeFileSync(sourcePath, after);

  const passing = runNarrowTest();
  assert.equal(passing.status, 0, passing.stderr || passing.stdout);
  console.log(JSON.stringify({
    eval: "golden-v1-total-calculation",
    status: "passed",
    repositoryEvidence: { definition: "calculateTotal", references: 1 },
    correction: "one_line",
    narrowTest: "node --test test/cart.test.mjs",
    receiptTruth: { beforeExit: failing.status, afterExit: passing.status },
  }, null, 2));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
