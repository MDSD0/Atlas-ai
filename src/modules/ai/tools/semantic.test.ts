import { describe, expect, it } from "vitest";
import { summarizeSemanticAvailability } from "./semantic";

describe("summarizeSemanticAvailability", () => {
  it("reports no applicable provider without claiming a request", () => {
    expect(summarizeSemanticAvailability([])).toEqual({
      status: "not_applicable",
      providers: [],
      semantic_requests: "not_started",
    });
  });

  it("reports an available provider without starting semantics", () => {
    expect(
      summarizeSemanticAvailability([
        {
          id: "typescript",
          language: "typescript",
          status: "available",
          diagnostics_enabled: true,
          executable: "typescript-language-server",
          resolved_path: "/bin/typescript-language-server",
          detail: "available",
        },
      ]),
    ).toMatchObject({
      status: "available",
      semantic_requests: "not_started",
    });
  });

  it("keeps a connected provider semantically available", () => {
    expect(
      summarizeSemanticAvailability([
        {
          id: "typescript",
          language: "typescript",
          status: "connected",
          diagnostics_enabled: true,
          executable: "typescript-language-server",
          resolved_path: "/bin/typescript-language-server",
          detail: "connected",
        },
      ]),
    ).toMatchObject({
      status: "available",
      semantic_requests: "not_started",
    });
  });
});
