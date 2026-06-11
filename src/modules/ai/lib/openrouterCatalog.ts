import { invoke } from "@tauri-apps/api/core";

// Live OpenRouter model catalog. Typing "anthropic/claude-…" ids by hand is
// the workflow the user called out as broken — this fetches the public
// /models endpoint (no key required) through the native SSRF-guarded proxy
// and caches it for the session.

export type CatalogModel = {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD per 1M prompt tokens, formatted; null when free/unknown. */
  promptPrice: string | null;
};

let cache: { at: number; models: CatalogModel[] } | null = null;
const TTL_MS = 10 * 60_000;

/**
 * Fuzzy filter: each query word must match as a plain substring (strong) or
 * as a substring of the separator-stripped haystack (weak — "gpt55" hits
 * "gpt-5.5", "opus48" hits "opus-4.8"). A free character-subsequence match
 * would be too loose: "opus" subsequence-matches "anthropic/claude-sonnet".
 * Results rank strong hits first, then shorter ids so canonical models beat
 * dated/preview variants.
 */
export function filterCatalog(
  models: CatalogModel[],
  query: string,
  limit = 50,
): CatalogModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return models.slice(0, limit);
  const words = q.split(/\s+/).map((w) => ({
    raw: w,
    compact: w.replace(/[^a-z0-9]/g, ""),
  }));
  const scored: { m: CatalogModel; score: number }[] = [];
  for (const m of models) {
    const hay = `${m.id} ${m.name}`.toLowerCase();
    const compactHay = hay.replace(/[^a-z0-9 ]/g, "");
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (hay.includes(w.raw)) {
        score += 2;
      } else if (w.compact.length > 0 && compactHay.includes(w.compact)) {
        score += 1;
      } else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ m, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.m.id.length - b.m.id.length,
  );
  return scored.slice(0, limit).map((s) => s.m);
}

function formatPromptPrice(prompt: unknown): string | null {
  const perToken = typeof prompt === "string" ? parseFloat(prompt) : NaN;
  if (!Number.isFinite(perToken)) return null;
  if (perToken === 0) return "free";
  const perMillion = perToken * 1_000_000;
  return `$${perMillion < 1 ? perMillion.toFixed(2) : perMillion.toFixed(1)}/M`;
}

export function parseCatalog(json: unknown): CatalogModel[] {
  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return [];
  const out: CatalogModel[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as {
      id?: unknown;
      name?: unknown;
      context_length?: unknown;
      pricing?: { prompt?: unknown };
    };
    if (typeof m.id !== "string" || m.id.length === 0) continue;
    out.push({
      id: m.id,
      name: typeof m.name === "string" ? m.name : m.id,
      contextLength:
        typeof m.context_length === "number" ? m.context_length : null,
      promptPrice: formatPromptPrice(m.pricing?.prompt),
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export async function fetchOpenRouterCatalog(
  force = false,
): Promise<CatalogModel[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.models;
  const resp = await invoke<{ status: number; body: number[] }>(
    "ai_http_request",
    { url: "https://openrouter.ai/api/v1/models", method: "GET" },
  );
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`OpenRouter catalog returned ${resp.status}`);
  }
  const text = new TextDecoder().decode(new Uint8Array(resp.body));
  const models = parseCatalog(JSON.parse(text));
  if (models.length === 0) throw new Error("OpenRouter catalog was empty");
  cache = { at: Date.now(), models };
  return models;
}
