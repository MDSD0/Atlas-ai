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
  // Installed but Atlas does not deliver diagnostics for it: be honest:
  // "detected", never "on".
  if (LIVE.has(p.status) && !p.diagnostics_enabled) {
    return { suffix: "detected", tone: "muted" };
  }
  if (LIVE.has(p.status)) return { suffix: "on", tone: "ok" };
  return { suffix: "off", tone: "muted" };
}

/**
 * Healthy is silent. Nine "diag X: on" chips carry zero information — the
 * footer summarizes working diagnostics in ONE chip and spends individual
 * chips only on actual problems (broken servers). Installed-but-deferred and
 * not-installed servers are normal states and stay out of the footer; the
 * Ext tab keeps the full per-provider table. Still honest by construction:
 * "ready" counts only providers that are live AND deliver diagnostics.
 */
export function lspChips(providers: LspProviderInfo[] | null): StatusChip[] {
  if (!providers || providers.length === 0) {
    return [{ label: "diagnostics: none", tone: "muted" }];
  }
  const states = providers.map(lspState);
  const ready = states.filter((s) => s.suffix === "on").length;
  const chips: StatusChip[] = [
    ready > 0
      ? { label: `diagnostics: ${ready} ready`, tone: "ok" }
      : { label: "diagnostics: none active", tone: "muted" },
  ];
  for (let i = 0; i < providers.length; i++) {
    if (states[i].suffix === "broken") {
      chips.push({ label: `${providers[i].language}: broken`, tone: "warn" });
    }
  }
  return chips;
}

/**
 * Memory chips: LocalRecords is the always-on default, so it earns no chip —
 * only deviations surface (SimpleMem healthy, or enabled-but-unreachable).
 */
export function memoryChips(memory: MemoryStatus | null): StatusChip[] {
  if (!memory) return [];
  const sm = memory.simplemem;
  if (sm.status === "available") {
    return [{ label: "SimpleMem: on", tone: "ok" }];
  }
  if (sm.status === "unavailable") {
    return [{ label: "SimpleMem: off", tone: "warn" }];
  }
  // "disabled" (opt-in, not started) shows nothing — no noise for a feature
  // the user hasn't enabled.
  return [];
}
