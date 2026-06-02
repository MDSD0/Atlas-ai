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
const harnessInspector = read("src/modules/ai/components/HarnessInspector.tsx");
const miniWindow = read("src/modules/ai/components/AiMiniWindow.tsx");

assert.equal(config.build.devUrl, "http://localhost:1420");
assert.equal(config.build.frontendDist, "../dist");
assert.equal(config.build.beforeDevCommand, "pnpm dev");
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
for (const memorySurfaceTool of [
  "memory_surface_status",
  "memory_surface_enable",
  "memory_surface_disable",
  "memory_surface_read_index",
  "memory_surface_search_sessions",
  "memory_surface_export_work_packet",
]) {
  assert.match(memoryTools, new RegExp(memorySurfaceTool));
}
assert.match(transport, /onContextPacked/);
assert.match(harnessInspector, /Last packed model input/);
assert.match(harnessInspector, /Task subgraph preview - not auto-injected/);
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
    "proof receipt mount",
  ],
}, null, 2));
