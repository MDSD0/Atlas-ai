import { accessSync, constants } from "node:fs";
import { delimiter, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const fixture = join(repoRoot, "tests", "fixtures", "mixed-stack");
const binary = findExecutable("codebase-memory-mcp");
const runExternal = process.argv.includes("--run-external");

accessSync(fixture, constants.R_OK);

const report = {
  atlas: {
    fixture,
    ranking_strategy: "aider_weighted_pagerank",
    comparison_scope: [
      "bounded repository context",
      "exact symbol definitions and references",
      "task-specific file ranking",
    ],
  },
  codebase_memory_mcp: {
    status: binary ? "available_not_run" : "unavailable_not_installed",
    binary,
    execution: "disabled_by_default",
    comparison_scope: [
      "index_repository",
      "get_graph_schema",
      "search_graph",
      "trace_call_path",
    ],
    sample_commands: [
      `codebase-memory-mcp cli index_repository '${JSON.stringify({ repo_path: fixture })}'`,
      "codebase-memory-mcp cli get_graph_schema '{}'",
      `codebase-memory-mcp cli search_graph '${JSON.stringify({ name_pattern: ".*calculateTotal.*" })}'`,
      `codebase-memory-mcp cli trace_call_path '${JSON.stringify({ function_name: "calculateTotal", direction: "both" })}'`,
    ],
  },
};

if (runExternal) {
  if (!binary) {
    throw new Error(
      "codebase-memory-mcp is not installed; refusing to auto-install an external graph provider",
    );
  }
  report.codebase_memory_mcp.status =
    "available_external_sample_requires_operator_review";
  report.codebase_memory_mcp.execution =
    "not_started: run the printed sample commands after choosing a CBM_CACHE_DIR";
}

console.log(JSON.stringify(report, null, 2));
console.log("codebase-memory preflight: OK");

function findExecutable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }
  return null;
}
