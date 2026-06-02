import type { LspProviderInfo } from "../lib/native";
import type { MemoryStatus } from "../store/statusStore";

// Pure summarizers for the CodeReality status footer. Honest by construction:
// they only report what the probes actually returned.

export type StatusChip = {
  label: string;
  tone: "ok" | "muted" | "warn";
};

const LIVE = new Set(["available", "connected"]);

function lspState(p: LspProviderInfo): { suffix: string; tone: StatusChip["tone"] } {
  if (p.status === "broken") return { suffix: "broken", tone: "warn" };
  // Installed but Atlas does not deliver diagnostics for it yet: be honest —
  // "detected", never "on". Only TypeScript is wired today.
  if (LIVE.has(p.status) && !p.diagnostics_enabled) {
    return { suffix: "detected", tone: "muted" };
  }
  if (LIVE.has(p.status)) return { suffix: "on", tone: "ok" };
  return { suffix: "off", tone: "muted" };
}

/**
 * One chip per language server. These describe semantic DIAGNOSTICS, not
 * indexing — the repo map indexes TS/JS/TSX/Python/Rust regardless. A provider
 * reads "on" only when it is live AND Atlas actually delivers its diagnostics;
 * an installed-but-deferred server reads "detected", a missing one "off", never
 * a semantic guarantee. The "diag:" prefix keeps it distinct from indexing.
 */
export function lspChips(providers: LspProviderInfo[] | null): StatusChip[] {
  if (!providers || providers.length === 0) {
    return [{ label: "diag: none", tone: "muted" }];
  }
  return providers.map((p) => {
    const { suffix, tone } = lspState(p);
    return { label: `diag ${p.language}: ${suffix}`, tone };
  });
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
