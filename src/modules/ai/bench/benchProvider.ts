/**
 * Provider resolution for benchmarks. Decouples the bench from any single
 * provider so cheap models (DeepSeek, OpenRouter routes, Groq, Gemini) can drive
 * harness-probe testing while Anthropic is reserved for occasional ceiling
 * checks. Keys are read from redacted `.env` slots.
 *
 * Select with BENCH_PROVIDER (default anthropic):
 *   anthropic  → BENCH_MODEL or claude-haiku-4-5      key: anthropic=
 *   deepseek   → BENCH_MODEL or deepseek-v4-flash     key: deepseek=
 *   groq       → BENCH_MODEL or llama-3.3-70b-versatile  key: gq1=
 *   google     → BENCH_MODEL or gemini-2.5-flash      key: g1=
 *   openrouter → openrouter-custom + BENCH_OR_MODEL    key:
 *                openrouter_paid_key=, OPENROUTER_API_KEY=, open_router=, key1=
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY_PROVIDER_KEYS, type ProviderKeys } from "../lib/keyring";
import type { ModelId } from "../config";

function envVal(name: string): string {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

function firstEnvVal(names: string[]): string {
  for (const name of names) {
    const value = envVal(name);
    if (value) return value;
  }
  return "";
}

export type BenchProvider = {
  keys: ProviderKeys;
  modelId: ModelId;
  openrouterModelId?: string;
  label: string;
  keyPresent: boolean;
};

export function resolveBenchProvider(): BenchProvider {
  const provider = (process.env.BENCH_PROVIDER ?? "anthropic").toLowerCase();
  const model = process.env.BENCH_MODEL;
  const base = (
    keyField: keyof ProviderKeys,
    key: string,
    modelId: string,
    extra: Partial<BenchProvider> = {},
  ): BenchProvider => ({
    keys: { ...EMPTY_PROVIDER_KEYS, [keyField]: key },
    modelId: modelId as ModelId,
    label: `${provider}/${extra.openrouterModelId ?? modelId}`,
    keyPresent: key.length > 0,
    ...extra,
  });

  switch (provider) {
    case "deepseek":
      return base("deepseek", envVal("deepseek"), model ?? "deepseek-v4-flash");
    case "groq":
      return base("groq", envVal("gq1"), model ?? "llama-3.3-70b-versatile");
    case "google":
      return base("google", envVal("g1"), model ?? "gemini-2.5-flash");
    case "openrouter":
      return base("openrouter", firstEnvVal([
        "openrouter_paid_key",
        "OPENROUTER_API_KEY",
        "open_router",
        "key1",
      ]), "openrouter-custom", {
        openrouterModelId: process.env.BENCH_OR_MODEL ?? "deepseek/deepseek-chat",
      });
    case "anthropic":
    default:
      return base("anthropic", envVal("anthropic"), model ?? "claude-haiku-4-5");
  }
}
