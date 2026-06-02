import assert from "node:assert/strict";
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { arch, platform } from "node:process";
import { spawnSync } from "node:child_process";

function executable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function probe(command, args, timeout = 5000) {
  if (!command) return { ok: false, status: "unavailable_not_installed" };
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    status: result.status === 0 ? "available" : "unavailable",
    detail: (result.stdout || result.stderr || "").trim().slice(0, 512),
  };
}

const python = executable(platform === "win32" ? "python.exe" : "python3");
const docker = executable(platform === "win32" ? "docker.exe" : "docker");
const dockerDaemon = probe(docker, ["info", "--format", "{{.ServerVersion}}"]);
const sweBenchRoot = process.env.SWE_BENCH_ROOT ?? "";
const sweBenchCheckout =
  sweBenchRoot && existsSync(join(sweBenchRoot, "swebench", "harness", "run_evaluation.py"));
const args = [
  "-m",
  "swebench.harness.run_evaluation",
  "--predictions_path",
  "gold",
  "--max_workers",
  "1",
  "--instance_ids",
  "sympy__sympy-20590",
  "--run_id",
  "atlas-validate-gold",
];
if (platform === "darwin" && arch === "arm64") args.push("--namespace", "");

const report = {
  benchmark: "SWE-bench official gold smoke",
  mode: process.argv.includes("--run-sample") ? "run-sample" : "preflight-only",
  source: "github:SWE-bench/SWE-bench",
  python: python ? "available" : "unavailable_not_installed",
  dockerCli: docker ? "available" : "unavailable_not_installed",
  dockerDaemon: dockerDaemon.status,
  sweBenchCheckout: sweBenchCheckout
    ? "available_from_SWE_BENCH_ROOT"
    : "unavailable_set_SWE_BENCH_ROOT",
  sampleCommand: [python ?? "python3", ...args].join(" "),
};

assert.match(report.sampleCommand, /swebench\.harness\.run_evaluation/);
assert.match(report.sampleCommand, /sympy__sympy-20590/);

if (process.argv.includes("--run-sample")) {
  assert.ok(python, "python3 is required to run the official SWE-bench sample");
  assert.ok(dockerDaemon.ok, "a running Docker daemon is required for SWE-bench");
  assert.ok(sweBenchCheckout, "set SWE_BENCH_ROOT to an official SWE-bench checkout");
  const result = spawnSync(python, args, {
    cwd: sweBenchRoot,
    encoding: "utf8",
    stdio: "inherit",
    timeout: Number(process.env.SWE_BENCH_TIMEOUT_MS ?? 3_600_000),
  });
  assert.equal(result.status, 0, "the official SWE-bench gold sample failed");
}

console.log(JSON.stringify(report, null, 2));
console.log("external-benchmark-preflight: OK");
