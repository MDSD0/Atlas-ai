import { describe, expect, it } from "vitest";
import { lspChips, memoryChips } from "./statusChips";
import type { LspProviderInfo } from "../lib/native";
import type { MemoryStatus } from "../store/statusStore";

function provider(patch: Partial<LspProviderInfo> = {}): LspProviderInfo {
  return {
    id: "typescript",
    language: "typescript",
    status: "available",
    executable: "typescript-language-server",
    resolved_path: "/usr/bin/typescript-language-server",
    detail: "",
    ...patch,
  };
}

describe("lspChips", () => {
  it("reads 'none' when no provider is discovered", () => {
    expect(lspChips(null)).toEqual([{ label: "LSP: none", tone: "muted" }]);
    expect(lspChips([])).toEqual([{ label: "LSP: none", tone: "muted" }]);
  });

  it("marks an available/connected provider on", () => {
    expect(lspChips([provider({ status: "available" })])).toEqual([
      { label: "typescript: on", tone: "ok" },
    ]);
    expect(lspChips([provider({ status: "connected" })])).toEqual([
      { label: "typescript: on", tone: "ok" },
    ]);
  });

  it("never claims on for discovered-but-not-running or broken servers", () => {
    expect(lspChips([provider({ status: "unavailable" })])[0]).toMatchObject({
      label: "typescript: off",
      tone: "muted",
    });
    expect(lspChips([provider({ status: "broken" })])[0]).toMatchObject({
      label: "typescript: off",
      tone: "warn",
    });
  });
});

function memory(sm: MemoryStatus["simplemem"]): MemoryStatus {
  return { primary: "local_records", simplemem: sm };
}

describe("memoryChips", () => {
  it("always shows local memory as active", () => {
    expect(memoryChips(null)).toEqual([{ label: "Memory: local", tone: "ok" }]);
  });

  it("shows SimpleMem on only when its health probe passed", () => {
    const chips = memoryChips(
      memory({
        provider: "simplemem",
        status: "available",
        optional: true,
        endpoint: "http://127.0.0.1:8766/health",
        latencyMs: 5,
        detail: "ok",
      }),
    );
    expect(chips).toContainEqual({ label: "SimpleMem: on", tone: "ok" });
  });

  it("hides SimpleMem entirely when disabled (opt-in, not started)", () => {
    const chips = memoryChips(
      memory({
        provider: "simplemem",
        status: "disabled",
        optional: true,
        detail: "disabled",
      }),
    );
    expect(chips).toEqual([{ label: "Memory: local", tone: "ok" }]);
  });

  it("warns when an enabled SimpleMem sidecar is unreachable", () => {
    const chips = memoryChips(
      memory({
        provider: "simplemem",
        status: "unavailable",
        optional: true,
        endpoint: "http://127.0.0.1:8766/health",
        latencyMs: 750,
        detail: "timeout",
      }),
    );
    expect(chips).toContainEqual({ label: "SimpleMem: off", tone: "warn" });
  });
});
