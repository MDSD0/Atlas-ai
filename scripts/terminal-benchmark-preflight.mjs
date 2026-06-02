import assert from "node:assert/strict";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { platform } from "node:process";
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

const harbor = executable(platform === "win32" ? "harbor.exe" : "harbor");
const docker = executable(platform === "win32" ? "docker.exe" : "docker");
const dockerDaemon = probe(docker, ["info", "--format", "{{.ServerVersion}}"]);
const args = [
  "run",
  "-d",
  "terminal-bench/terminal-bench-2",
  "-a",
  "oracle",
  "-l",
  "1",
];

const report = {
  benchmark: "Terminal-Bench 2.0 official Harbor oracle smoke",
  mode: process.argv.includes("--run-sample") ? "run-sample" : "preflight-only",
  source: "github:harbor-framework/harbor",
  dataset: "terminal-bench/terminal-bench-2",
  taskLimit: 1,
  harbor: harbor ? "available" : "unavailable_not_installed",
  dockerCli: docker ? "available" : "unavailable_not_installed",
  dockerDaemon: dockerDaemon.status,
  sampleCommand: [harbor ?? "harbor", ...args].join(" "),
};

assert.match(report.sampleCommand, /harbor run -d terminal-bench\/terminal-bench-2/);
assert.match(report.sampleCommand, /-a oracle/);
assert.match(report.sampleCommand, /-l 1/);

if (process.argv.includes("--run-sample")) {
  assert.ok(harbor, "install the official Harbor CLI before running Terminal-Bench");
  assert.ok(dockerDaemon.ok, "a running Docker daemon is required for Terminal-Bench");
  const result = spawnSync(harbor, args, {
    encoding: "utf8",
    stdio: "inherit",
    timeout: Number(process.env.TERMINAL_BENCH_TIMEOUT_MS ?? 3_600_000),
  });
  assert.equal(result.status, 0, "the official Terminal-Bench oracle sample failed");
}

console.log(JSON.stringify(report, null, 2));
console.log("terminal-benchmark-preflight: OK");
