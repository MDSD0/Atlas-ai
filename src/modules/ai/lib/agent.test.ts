import { describe, expect, it } from "vitest";
import { PLAN_MODE_ACTIVE_TOOLS } from "./agent";

describe("agent plan mode", () => {
  it("exposes only read-only drafting tools before the user proceeds", () => {
    expect(PLAN_MODE_ACTIVE_TOOLS).toEqual([
      "repo_context",
      "read_file",
      "grep",
      "glob",
      "list_directory",
    ]);
    expect(PLAN_MODE_ACTIVE_TOOLS).not.toContain("write_file");
    expect(PLAN_MODE_ACTIVE_TOOLS).not.toContain("edit");
    expect(PLAN_MODE_ACTIVE_TOOLS).not.toContain("create_directory");
    expect(PLAN_MODE_ACTIVE_TOOLS).not.toContain("bash_run");
    expect(PLAN_MODE_ACTIVE_TOOLS).not.toContain("serve_preview");
  });
});
