import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { arch, platform } from "node:process";

const root = resolve(import.meta.dirname, "..");
const strict = process.argv.includes("--strict");
const checks = [];

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function add(id, status, summary, details = {}) {
  checks.push({ id, status, summary, details });
}

function executable(name) {
  const names =
    platform === "win32" && !/\.[a-z0-9]+$/i.test(name)
      ? [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`]
      : [name];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    for (const candidateName of names) {
      const candidate = join(directory, candidateName);
      try {
        accessSync(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function probe(command, args, timeout = 8000) {
  if (!command) {
    return {
      ok: false,
      status: "unavailable_not_installed",
      detail: "",
    };
  }
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const timedOut = result.error?.code === "ETIMEDOUT";
  return {
    ok: result.status === 0,
    status: timedOut ? "timeout" : result.status === 0 ? "available" : "unavailable",
    detail: sanitizeDetail(result.stdout || result.stderr || result.error?.message || ""),
  };
}

function sanitizeDetail(text) {
  return text
    .replace(/Token:\s+\S+/gi, "Token: [redacted]")
    .replace(/\bgh[opsu]_[A-Za-z0-9_*]+/g, "[redacted-token]")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 700);
}

function contains(haystack, needle) {
  return haystack.includes(needle);
}

const packageJson = JSON.parse(read("package.json"));
const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json"));
const cargoToml = read("src-tauri/Cargo.toml");
const releaseWorkflow = read(".github/workflows/release.yml");
const ciWorkflow = read(".github/workflows/ci.yml");
const releasePreflight = read("scripts/release-preflight.mjs");
const sweBenchPreflight = read("scripts/external-benchmark-preflight.mjs");
const terminalBenchPreflight = read("scripts/terminal-benchmark-preflight.mjs");

const cargoVersion = cargoToml.match(/^version = "([^"]+)"/m)?.[1] ?? "";
if (packageJson.version === tauriConfig.version && packageJson.version === cargoVersion) {
  add("version-sync", "passed", "package.json, Cargo.toml, and Tauri config versions match", {
    version: packageJson.version,
  });
} else {
  add("version-sync", "blocked", "package.json, Cargo.toml, and Tauri config versions differ", {
    packageVersion: packageJson.version,
    cargoVersion,
    tauriVersion: tauriConfig.version,
  });
}

const releaseContractOk =
  contains(releaseWorkflow, "tauri-apps/tauri-action@action-v1.0.0") &&
  contains(releaseWorkflow, "uploadUpdaterJson: true") &&
  /grep -q '\^latest\\\.json\$'/.test(releaseWorkflow) &&
  /grep -q '\\\.sig\$'/.test(releaseWorkflow);

add(
  "release-workflow",
  releaseContractOk ? "passed" : "blocked",
  releaseContractOk
    ? "release workflow builds four platforms and verifies signed updater assets"
    : "release workflow is missing the current signed updater contract",
  {
    tauriActionV1: contains(releaseWorkflow, "tauri-apps/tauri-action@action-v1.0.0"),
    updaterJson: contains(releaseWorkflow, "uploadUpdaterJson: true"),
    macArm: contains(releaseWorkflow, "aarch64-apple-darwin"),
    macX64: contains(releaseWorkflow, "x86_64-apple-darwin"),
    linux: contains(releaseWorkflow, "ubuntu-22.04"),
    windows: contains(releaseWorkflow, "windows-latest"),
  },
);

const releasePreflightOk =
  contains(releasePreflight, "tauri-apps\\/tauri-action@action-v1\\.0\\.0") &&
  contains(releasePreflight, "uploadUpdaterJson: true");
add(
  "release-preflight",
  releasePreflightOk ? "passed" : "blocked",
  releasePreflightOk
    ? "static release preflight guards the current Tauri action and signature contract"
    : "static release preflight does not guard the current release contract",
);

const ciAuditOk = contains(ciWorkflow, "verify-atlas.sh --launch");
add(
  "ci-launch-audit",
  ciAuditOk ? "passed" : "warning",
  ciAuditOk
    ? "CI runs the advisory launchability audit"
    : "CI does not run the advisory launchability audit",
);

const sweBenchCommandOk =
  contains(sweBenchPreflight, "swebench.harness.run_evaluation") &&
  contains(sweBenchPreflight, "sympy__sympy-20590") &&
  contains(sweBenchPreflight, "--namespace") &&
  contains(sweBenchPreflight, "--run-sample");
add(
  "swe-bench-adapter",
  sweBenchCommandOk ? "passed" : "blocked",
  sweBenchCommandOk
    ? "SWE-bench adapter wraps the official Docker-backed gold smoke"
    : "SWE-bench adapter is missing the official gold smoke contract",
);

const terminalBenchCommandOk =
  contains(terminalBenchPreflight, "terminal-bench@2.0") &&
  contains(terminalBenchPreflight, "--agent") &&
  contains(terminalBenchPreflight, "oracle") &&
  contains(terminalBenchPreflight, "--n-concurrent") &&
  contains(terminalBenchPreflight, "--n-tasks") &&
  contains(terminalBenchPreflight, "--run-sample");
add(
  "terminal-bench-adapter",
  terminalBenchCommandOk ? "passed" : "blocked",
  terminalBenchCommandOk
    ? "Terminal-Bench adapter wraps Harbor's current bounded oracle command"
    : "Terminal-Bench adapter is missing Harbor's current bounded oracle command",
);

const git = executable("git");
const branch = probe(git, ["branch", "--show-current"], 3000);
const dirty = probe(git, ["status", "--short"], 3000);
const dirtyLines = dirty.detail
  .split(" ")
  .filter(Boolean)
  .length === 0
  ? []
  : dirty.detail.split(/ (?=[MADRCU?]{1,2} )/).filter(Boolean);
add("git-state", dirty.detail ? "warning" : "passed", dirty.detail ? "worktree has local changes" : "worktree is clean", {
  branch: branch.detail,
  dirtyPreview: dirty.detail.slice(0, 350),
});

const docker = executable(platform === "win32" ? "docker.exe" : "docker");
const dockerDaemon = probe(docker, ["info", "--format", "{{.ServerVersion}}"], 5000);
add(
  "docker-daemon",
  dockerDaemon.ok ? "passed" : "blocked",
  dockerDaemon.ok
    ? "Docker daemon is available for external benchmark samples"
    : "Docker daemon is unavailable, so SWE-bench and Terminal-Bench samples cannot run",
  {
    dockerCli: docker ? "available" : "unavailable_not_installed",
    dockerDaemon: dockerDaemon.status,
    detail: dockerDaemon.detail,
  },
);

const sweBenchRoot = process.env.SWE_BENCH_ROOT ?? "";
const sweBenchCheckout =
  sweBenchRoot && existsSync(join(sweBenchRoot, "swebench", "harness", "run_evaluation.py"));
add(
  "swe-bench-checkout",
  sweBenchCheckout ? "passed" : "blocked",
  sweBenchCheckout
    ? "SWE_BENCH_ROOT points at an official checkout"
    : "SWE_BENCH_ROOT is not set to an official SWE-bench checkout",
  {
    sweBenchRoot: sweBenchRoot || "unset",
    appleSiliconNamespace: platform === "darwin" && arch === "arm64" ? "required" : "not_required",
  },
);

const harbor = executable(platform === "win32" ? "harbor.exe" : "harbor");
const harborVersion = probe(harbor, ["--version"], 5000);
add(
  "harbor-cli",
  harbor ? "passed" : "blocked",
  harbor
    ? "Harbor CLI is installed for Terminal-Bench samples"
    : "Harbor CLI is not installed, so Terminal-Bench samples cannot run",
  {
    harbor: harbor ? "available" : "unavailable_not_installed",
    detail: harborVersion.detail,
  },
);

const gh = executable(platform === "win32" ? "gh.exe" : "gh");
const ghAuth = probe(gh, ["auth", "status"], 8000);
add(
  "github-auth",
  ghAuth.ok ? "passed" : "blocked",
  ghAuth.ok
    ? "GitHub CLI authentication is available for release publication checks"
    : "GitHub CLI authentication is unavailable or invalid",
  {
    gh: gh ? "available" : "unavailable_not_installed",
    detail: ghAuth.detail,
  },
);

if (ghAuth.ok) {
  const ghApi = probe(gh, ["api", "repos/MDSD0/Atlas-ai", "--jq", ".full_name"], 8000);
  add(
    "github-api",
    ghApi.ok ? "passed" : "blocked",
    ghApi.ok
      ? "GitHub API is reachable for Atlas release checks"
      : "GitHub API is not reachable for Atlas release checks",
    { detail: ghApi.detail },
  );
} else {
  add("github-api", "blocked", "GitHub API check skipped because auth is not healthy");
}

const curl = executable(platform === "win32" ? "curl.exe" : "curl");
const updaterEndpoint = tauriConfig.plugins?.updater?.endpoints?.[0] ?? "";
const updaterProbe = updaterEndpoint
  ? probe(curl, ["-fsSIL", "--max-time", "8", updaterEndpoint], 10_000)
  : { ok: false, status: "missing", detail: "" };
add(
  "updater-endpoint",
  updaterProbe.ok ? "passed" : "blocked",
  updaterProbe.ok
    ? "configured updater metadata endpoint is reachable"
    : "configured updater metadata endpoint is not published or not reachable",
  {
    endpoint: updaterEndpoint,
    detail: updaterProbe.detail,
  },
);

if (platform === "darwin") {
  const appPath = resolve(root, "src-tauri/target/debug/bundle/macos/Atlas.app");
  const codesign = executable("codesign");
  const signProbe = existsSync(appPath)
    ? probe(codesign, ["--verify", "--deep", "--strict", "--verbose=2", appPath], 10_000)
    : { ok: false, status: "missing", detail: "debug app bundle is not present" };
  add(
    "debug-app-signature",
    signProbe.ok ? "passed" : "warning",
    signProbe.ok
      ? "local debug app bundle has a valid on-disk signature"
      : "local debug app signature is unavailable for this host audit",
    {
      appPath,
      detail: signProbe.detail,
    },
  );
}

const blockers = checks.filter((check) => check.status === "blocked");
const warnings = checks.filter((check) => check.status === "warning");
const report = {
  audit: "atlas-launchability",
  mode: strict ? "strict" : "advisory",
  status: blockers.length === 0 ? "passed" : "blocked",
  checkedAt: new Date().toISOString(),
  counts: {
    passed: checks.filter((check) => check.status === "passed").length,
    warning: warnings.length,
    blocked: blockers.length,
  },
  blockers: blockers.map((check) => ({ id: check.id, summary: check.summary })),
  warnings: warnings.map((check) => ({ id: check.id, summary: check.summary })),
  checks,
};

console.log(JSON.stringify(report, null, 2));

if (strict && blockers.length > 0) {
  console.error(`launchability-audit: blocked (${blockers.length})`);
  process.exit(1);
}

console.log(
  blockers.length > 0
    ? `launchability-audit: advisory blocked (${blockers.length})`
    : "launchability-audit: OK",
);
