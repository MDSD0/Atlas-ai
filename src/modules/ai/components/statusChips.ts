import type { LspProviderInfo } from "../lib/native";
import type { MemoryStatus } from "../store/statusStore";

// Pure summarizers for the CodeReality status footer. Honest by construction:
// they only report what the probes actually returned.

export type StatusChip = {
  label: string;
  tone: "ok" | "muted" | "warn";
};

const LIVE = new Set(["available", "connected"]);

/**
 * One chip per language server, plus an overall note. A provider only reads as
 * "on" when its native probe says available/connected — a discovered-but-not-
 * running server reads as off, never as a semantic guarantee.
 */
export function lspChips(providers: LspProviderInfo[] | null): StatusChip[] {
  if (!providers || providers.length === 0) {
    return [{ label: "LSP: none", tone: "muted" }];
  }
  return providers.map((p) => ({
    label: `${p.language}: ${LIVE.has(p.status) ? "on" : "off"}`,
    tone: LIVE.has(p.status) ? "ok" : p.status === "broken" ? "warn" : "muted",
  }));
}

/**
 * Memory chips: LocalRecords is always the active default; SimpleMem reads as
 * on only when its optional sidecar health probe passed.
 */
export function memoryChips(memory: MemoryStatus | null): StatusChip[] {
  if (!memory) return [{ label: "Memory: local", tone: "ok" }];
  const chips: StatusChip[] = [{ label: "Memory: local", tone: "ok" }];
  const sm = memory.simplemem;
  if (sm.status === "available") {
    chips.push({ label: "SimpleMem: on", tone: "ok" });
  } else if (sm.status === "unavailable") {
    chips.push({ label: "SimpleMem: off", tone: "warn" });
  }
  // "disabled" (opt-in, not started) shows nothing — no noise for a feature
  // the user hasn't enabled.
  return chips;
}
