import { describe, expect, it } from "vitest";
import {
  semanticEvidenceFromToolResult,
  summarizeDiagnosticEvidence,
} from "./diagnostics";

describe("proof diagnostic evidence", () => {
  it("extracts nested post-edit evidence", () => {
    expect(
      semanticEvidenceFromToolResult("edit", {
        post_edit_diagnostics: { status: "fresh" },
      }),
    ).toEqual({ status: "fresh" });
  });

  it("keeps explicit semantic-tool evidence", () => {
    const evidence = { status: "pending" };
    expect(semanticEvidenceFromToolResult("lsp_diagnostics", evidence)).toBe(
      evidence,
    );
  });

  it("summarizes diagnostics with one-based locations", () => {
    expect(
      summarizeDiagnosticEvidence({
        provider: "typescript",
        status: "fresh",
        file: "/repo/a.ts",
        diagnostics: [
          {
            range: { start: { line: 1, character: 2 } },
            source: "ts",
            message: "sample warning",
          },
        ],
      }),
    ).toEqual(["/repo/a.ts:2:3 ts: sample warning"]);
  });

  it("makes unavailable semantic state visible", () => {
    expect(
      summarizeDiagnosticEvidence({
        provider: "typescript",
        status: "unavailable",
        file: "/repo/a.ts",
        diagnostics: [],
        detail: "not installed",
      }),
    ).toEqual(["typescript /repo/a.ts: unavailable; 0 diagnostics: not installed"]);
  });
});
