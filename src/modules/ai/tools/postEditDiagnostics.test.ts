import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lspDiagnostics: vi.fn(),
}));

vi.mock("../lib/native", () => ({
  agentNative: {
    lspDiagnostics: mocks.lspDiagnostics,
  },
}));

import {
  refreshPostEditDiagnostics,
  supportsPostEditDiagnostics,
} from "./postEditDiagnostics";

describe("post-edit diagnostics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes registered language-server families", () => {
    expect(supportsPostEditDiagnostics("/repo/a.tsx")).toBe(true);
    expect(supportsPostEditDiagnostics("/repo/a.rs")).toBe(true);
    expect(supportsPostEditDiagnostics("/repo/a.py")).toBe(true);
    expect(supportsPostEditDiagnostics("/repo/a.cpp")).toBe(true);
    expect(supportsPostEditDiagnostics("/repo/readme.md")).toBe(false);
  });

  it("does not invoke LSP for files without an adapter", async () => {
    await expect(refreshPostEditDiagnostics("/repo", "/repo/readme.md")).resolves
      .toMatchObject({
        provider: null,
        status: "not_applicable",
        diagnostics: [],
      });
    expect(mocks.lspDiagnostics).not.toHaveBeenCalled();
  });

  it("keeps unavailable semantics non-fatal after a write", async () => {
    mocks.lspDiagnostics.mockRejectedValue(new Error("not installed"));
    await expect(refreshPostEditDiagnostics("/repo", "/repo/a.rs")).resolves
      .toMatchObject({
        provider: "rust-analyzer",
        status: "unavailable",
        diagnostics: [],
      });
  });
});
