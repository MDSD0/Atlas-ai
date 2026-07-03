import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const readNormalized = (path) => read(path).replace(/\r\n/g, "\n");
const packageJson = JSON.parse(read("package.json"));
const lockfile = readNormalized("pnpm-lock.yaml");
const config = JSON.parse(read("src-tauri/tauri.conf.json"));
const updater = read("src/modules/updater/useUpdater.ts");
const workflow = read(".github/workflows/release.yml");

assert.equal(packageJson.dependencies["@tauri-apps/api"], "^2.11.0");
assert.match(
  lockfile,
  /'@tauri-apps\/api':\n\s+specifier: \^2\.11\.0\n\s+version: 2\.11\.0/,
);
assert.equal(
  config.build.beforeDevCommand,
  "node node_modules/vite/bin/vite.js --host localhost --port 1420 --strictPort --clearScreen false",
);
assert.equal(config.build.beforeBuildCommand, "pnpm build");
assert.equal(config.bundle.createUpdaterArtifacts, true);
assert.match(updater, /useUpdater\(\{ autoCheck = false \}/);
assert.match(workflow, /tauri-apps\/tauri-action@v0\.6\.2/);
assert.match(workflow, /includeUpdaterJson: true/);
assert.match(workflow, /grep -q '\^latest\\\.json\$'/);
assert.match(workflow, /grep -q '\\\.sig\$'/);

console.log(JSON.stringify({
  preflight: "signed-release-contract",
  status: "passed",
  updaterBootPolicy: "manual_until_signed_metadata_is_published",
  updaterArtifacts: "required_by_bundle_and_release_workflow",
  tauriAction: "v0.6.2",
  lifecycleHooks: "pnpm_only",
  tauriFrontendApi: packageJson.dependencies["@tauri-apps/api"],
}, null, 2));
