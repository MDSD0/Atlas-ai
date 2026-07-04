import { LazyStore } from "@tauri-apps/plugin-store";
import { AGENTS_STORE_PATH } from "@/modules/ai/lib/agents";
import { SESSIONS_STORE_PATH } from "@/modules/ai/lib/sessions";
import { SNIPPETS_STORE_PATH } from "@/modules/ai/lib/snippets";
import { TODOS_STORE_PATH } from "@/modules/ai/lib/todos";
import { MCP_STORE_PATH } from "@/modules/ai/mcp/contracts";
import { MEMORY_STORE_PATH } from "@/modules/ai/memory/contracts";
import { MEMORY_SURFACE_STORE_PATH } from "@/modules/ai/memory/memorySurface";
import { METRICS_STORE_PATH } from "@/modules/ai/metrics/contracts";
import { PROOF_STORE_PATH } from "@/modules/ai/proof/persistence";
import { SKILL_STORE_PATH } from "@/modules/ai/skills/contracts";
import { SESSION_TRACE_STORE_PATH } from "@/modules/ai/traces/sessionTrace";
import { WORK_PACKET_STORE_PATH } from "@/modules/ai/workPackets/contracts";

/**
 * Every store holding chat/tool/dev-context data — deliberately excludes
 * `atlas-settings.json` and `atlas-custom-themes.json` (app preferences and
 * theme, not the "sensitive development context" this is scoped to) and API
 * keys (OS keychain, see `lib/keyring.ts` — never touches these JSON files).
 */
export const AI_DATA_STORE_PATHS: readonly string[] = [
  SESSIONS_STORE_PATH,
  AGENTS_STORE_PATH,
  SNIPPETS_STORE_PATH,
  TODOS_STORE_PATH,
  SESSION_TRACE_STORE_PATH,
  MCP_STORE_PATH,
  MEMORY_STORE_PATH,
  MEMORY_SURFACE_STORE_PATH,
  METRICS_STORE_PATH,
  SKILL_STORE_PATH,
  PROOF_STORE_PATH,
  WORK_PACKET_STORE_PATH,
];

export type AppDataExport = {
  exportedAt: string;
  stores: Record<string, Record<string, unknown>>;
  /** Present only if one or more stores failed to read — the rest of the
   * export still completes rather than being aborted by one bad store. */
  errors?: Record<string, string>;
};

export type ClearAllResult = {
  cleared: string[];
  /** Stores that failed to clear — the rest are still attempted rather than
   * aborting on the first failure, which would otherwise leave an ambiguous
   * partial clear silently reported as "done" to the caller. */
  failed: Array<{ path: string; error: string }>;
};

/** Reads every entry from every AI data store into one plain object. A
 * failure reading one store doesn't stop the others. */
export async function exportAllAppData(): Promise<AppDataExport> {
  const stores: Record<string, Record<string, unknown>> = {};
  const errors: Record<string, string> = {};
  for (const path of AI_DATA_STORE_PATHS) {
    try {
      const store = new LazyStore(path, { defaults: {}, autoSave: false });
      const entries = await store.entries();
      stores[path] = Object.fromEntries(entries);
    } catch (error) {
      errors[path] = String(error);
    }
  }
  return {
    exportedAt: new Date().toISOString(),
    stores,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  };
}

/** Wipes every AI data store. Does not touch app preferences, themes, or
 * API keys (OS keychain). A failure clearing one store doesn't stop the
 * others — callers must check `failed` rather than assuming a resolved
 * promise means every store was actually cleared. Callers should reload the
 * app afterward so every in-memory store re-hydrates from the now-empty
 * files instead of being hand-reconciled in place. */
export async function clearAllAppData(): Promise<ClearAllResult> {
  const cleared: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  for (const path of AI_DATA_STORE_PATHS) {
    try {
      const store = new LazyStore(path, { defaults: {}, autoSave: false });
      await store.clear();
      await store.save();
      cleared.push(path);
    } catch (error) {
      failed.push({ path, error: String(error) });
    }
  }
  return { cleared, failed };
}
