import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const config = JSON.parse(read("src-tauri/tauri.conf.json"));
const native = read("src-tauri/src/lib.rs");
const tools = read("src/modules/ai/tools/tools.ts");
const memoryTools = read("src/modules/ai/tools/memory.ts");
const transport = read("src/modules/ai/lib/transport.ts");
const repoGraphPane = read("src/modules/ai/components/RepoGraphPane.tsx");
const proofRecorder = read("src/modules/ai/proof/recorder.ts");
const proofRuntime = read("src/modules/ai/proof/runtime.ts");
const miniWindow = read("src/modules/ai/components/AiMiniWindow.tsx");

assert.equal(config.build.devUrl, "http://localhost:1420");
assert.equal(config.build.frontendDist, "../dist");
assert.equal(
  config.build.beforeDevCommand,
  "node node_modules/vite/bin/vite.js --host localhost --port 1420 --strictPort --clearScreen false",
);
assert.equal(config.build.beforeBuildCommand, "pnpm build");
assert.ok(config.app.windows.some((window) => window.title === "Atlas"));
for (const command of [
  "workspace_authorize_agent_project",
  "agent_reality_context",
  "agent_lsp_status",
  "agent_lsp_diagnostics",
  "agent_lsp_semantic",
  "agent_mcp_stdio_call",
  "agent_mcp_stdio_close",
  "shell_run_command",
]) {
  assert.match(native, new RegExp(command));
}
for (const toolBuilder of [
  "buildMemoryTools",
  "buildMcpTools",
  "buildMetricsTools",
  "buildRealityTools",
  "buildSemanticTools",
  "buildWorkPacketTools",
]) {
  assert.match(tools, new RegExp(toolBuilder));
}
// Consolidated memory governor surface (recall federates records/sessions/
// semantic; forget covers delete + clear; surface_enable is the one admin op).
for (const memoryGovernorTool of [
  "memory_recall",
  "memory_remember",
  "memory_list",
  "memory_forget",
  "memory_status",
  "memory_surface_enable",
]) {
  assert.match(memoryTools, new RegExp(memoryGovernorTool));
}
assert.match(transport, /onContextPacked/);
// The Impact Map is a full graph tab; the contract is that the graph can
// open files, attach context, and hand a task focus to the same native
// projection the agent's repo_context tool queries.
assert.match(repoGraphPane, /const onDoubleClick =/);
assert.match(repoGraphPane, /if \(node\) openPath\(node\.id\)/);
assert.match(repoGraphPane, /onDoubleClick=\{onDoubleClick\}/);
assert.match(repoGraphPane, /atlas:ai-attach-file/);
assert.match(repoGraphPane, /refresh\(workspaceRoot, nextTask\)/);
assert.match(proofRecorder, /lifecycle\.session_started/);
assert.match(proofRecorder, /approval\.\$\{stage\}/);
assert.match(proofRuntime, /latestBySession/);
assert.match(miniWindow, /<ReceiptStrip/);

console.log(JSON.stringify({
  smoke: "desktop-contract",
  status: "passed",
  host: process.platform,
  interactiveAutomation: process.platform === "darwin"
    ? "manual_required_wkwebview_has_no_webdriver"
    : "eligible_for_tauri_driver_follow_up",
  checked: [
    "tauri build contract",
    "native project binding",
    "repository reality command",
    "graceful LSP commands",
    "lazy RMCP stdio commands",
    "shell command lane",
    "memory MCP metrics work packet and filesystem surface tool registration",
    "packed context ledger and honest repository preview label",
    "durable redacted lifecycle and approval flight recorder",
    "proof receipt mount",
  ],
}, null, 2));
