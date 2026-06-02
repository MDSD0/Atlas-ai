import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  diagnostics: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("./postEditDiagnostics", () => ({
  refreshPostEditDiagnostics: mocks.diagnostics,
}));

vi.mock("../memory", () => ({
  invalidateMemoryForPaths: mocks.invalidate,
}));

import { observePostEdit } from "./postEdit";

describe("post-edit observation", () => {
  it("refreshes semantic evidence and stales linked memory together", async () => {
    mocks.diagnostics.mockResolvedValue({
      provider: "typescript",
      status: "fresh",
      file: "/repo/value.ts",
      diagnostics: [],
      waited_ms: 1,
      detail: "fresh",
    });
    mocks.invalidate.mockResolvedValue({
      provider: "local_records",
      status: "ok",
      staleRecordIds: ["m-1"],
      detail: "1 linked memory record(s) marked stale",
    });

    await expect(observePostEdit("/repo", "/repo/value.ts")).resolves.toMatchObject({
      post_edit_diagnostics: { status: "fresh" },
      memory_invalidation: { staleRecordIds: ["m-1"] },
    });
    expect(mocks.invalidate).toHaveBeenCalledWith("/repo", ["/repo/value.ts"]);
  });
});
