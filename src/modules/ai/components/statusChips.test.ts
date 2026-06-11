import { describe, expect, it } from "vitest";
import { lspChips, memoryChips } from "./statusChips";
import type { LspProviderInfo } from "../lib/native";
import type { MemoryStatus } from "../store/statusStore";

function provider(patch: Partial<LspProviderInfo> = {}): LspProviderInfo {
  return {
    id: "typescript",
    language: "typescript",
    status: "available",
    diagnostics_enabled: true,
    executable: "typescript-language-server",
    resolved_path: "/usr/bin/typescript-language-server",
    detail: "",
    ...patch,
  };
}

describe("lspChips (healthy is silent)", () => {
  it("reads 'none' when no provider is discovered", () => {
    expect(lspChips(null)).toEqual([
      { label: "diagnostics: none", tone: "muted" },
    ]);
    expect(lspChips([])).toEqual([
      { label: "diagnostics: none", tone: "muted" },
    ]);
  });

  it("collapses healthy providers into a single summary chip", () => {
    const chips = lspChips([
      provider({ language: "typescript", status: "available" }),
      provider({ language: "python", status: "connected" }),
      provider({ language: "rust", status: "available" }),
    ]);
    expect(chips).toEqual([{ label: "diagnostics: 3 ready", tone: "ok" }]);
  });

  it("counts only providers that actually deliver diagnostics", () => {
    // Detected-but-deferred and not-installed are normal states: no chip,
    // and they must not inflate the ready count.
    const chips = lspChips([
      provider({ language: "typescript", status: "available" }),
      provider({
        language: "rust",
        status: "available",
        diagnostics_enabled: false,
      }),
      provider({ language: "java", status: "unavailable" }),
    ]);
    expect(chips).toEqual([{ label: "diagnostics: 1 ready", tone: "ok" }]);
  });

  it("spends individual chips only on broken servers", () => {
    const chips = lspChips([
      provider({ language: "typescript", status: "available" }),
      provider({ language: "python", status: "broken" }),
    ]);
    expect(chips).toEqual([
      { label: "diagnostics: 1 ready", tone: "ok" },
      { label: "python: broken", tone: "warn" },
    ]);
  });

  it("reads 'none active' when servers exist but none deliver", () => {
    expect(lspChips([provider({ status: "unavailable" })])).toEqual([
      { label: "diagnostics: none active", tone: "muted" },
    ]);
  });
});

function memory(sm: MemoryStatus["simplemem"]): MemoryStatus {
  return { primary: "local_records", simplemem: sm };
}

describe("memoryChips (default earns no chip)", () => {
  it("shows nothing for the always-on local default", () => {
    expect(memoryChips(null)).toEqual([]);
  });

  it("shows SimpleMem on only when its health probe passed", () => {
    const chips = memoryChips(
      memory({
        provider: "simplemem",
        status: "available",
        optional: true,
        endpoint: "http://127.0.0.1:8766/cross/health",
        latencyMs: 5,
        detail: "ok",
      }),
    );
    expect(chips).toEqual([{ label: "SimpleMem: on", tone: "ok" }]);
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
    expect(chips).toEqual([]);
  });

  it("warns when an enabled SimpleMem sidecar is unreachable", () => {
    const chips = memoryChips(
      memory({
        provider: "simplemem",
        status: "unavailable",
        optional: true,
        endpoint: "http://127.0.0.1:8766/cross/health",
        latencyMs: 750,
        detail: "timeout",
      }),
    );
    expect(chips).toEqual([{ label: "SimpleMem: off", tone: "warn" }]);
  });
});
