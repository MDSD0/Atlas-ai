import { describe, expect, it } from "vitest";
import { filterCatalog, parseCatalog, type CatalogModel } from "./openrouterCatalog";

function model(id: string, name = id): CatalogModel {
  return { id, name, contextLength: 200000, promptPrice: "$3.0/M" };
}

const CATALOG = [
  model("anthropic/claude-opus-4.8", "Claude Opus 4.8"),
  model("anthropic/claude-sonnet-4.6", "Claude Sonnet 4.6"),
  model("openai/gpt-5.5", "GPT-5.5"),
  model("openai/gpt-5.4-mini", "GPT-5.4 Mini"),
  model("google/gemini-3.5-flash", "Gemini 3.5 Flash"),
  model("deepseek/deepseek-chat-v3", "DeepSeek V3"),
];

describe("filterCatalog (fuzzy model search)", () => {
  it("matches plain substrings across id and name", () => {
    const hits = filterCatalog(CATALOG, "opus");
    expect(hits.map((m) => m.id)).toEqual(["anthropic/claude-opus-4.8"]);
  });

  it("matches multi-word queries (all words must hit)", () => {
    const hits = filterCatalog(CATALOG, "opus 4.8");
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("anthropic/claude-opus-4.8");
  });

  it("matches compact queries against separator-stripped ids", () => {
    // "gpt55" has no raw substring match but hits compacted "gpt55".
    const hits = filterCatalog(CATALOG, "gpt55");
    expect(hits.map((m) => m.id)).toEqual(["openai/gpt-5.5"]);
    expect(filterCatalog(CATALOG, "opus48").map((m) => m.id)).toEqual([
      "anthropic/claude-opus-4.8",
    ]);
  });

  it("does not loosely subsequence-match short words", () => {
    // "opus" must NOT match sonnet via scattered letters.
    const hits = filterCatalog(CATALOG, "opus");
    expect(hits.map((m) => m.id)).toEqual(["anthropic/claude-opus-4.8"]);
  });

  it("returns everything (bounded) for an empty query", () => {
    expect(filterCatalog(CATALOG, "")).toHaveLength(CATALOG.length);
    expect(filterCatalog(CATALOG, "", 3)).toHaveLength(3);
  });

  it("excludes models where any query word misses entirely", () => {
    expect(filterCatalog(CATALOG, "opus zzz")).toHaveLength(0);
  });
});

describe("parseCatalog (OpenRouter /models response)", () => {
  it("parses ids, names, context and per-million pricing", () => {
    const parsed = parseCatalog({
      data: [
        {
          id: "anthropic/claude-opus-4.8",
          name: "Claude Opus 4.8",
          context_length: 200000,
          pricing: { prompt: "0.000005" },
        },
        { id: "x/free-model", name: "Free", pricing: { prompt: "0" } },
      ],
    });
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      id: "anthropic/claude-opus-4.8",
      contextLength: 200000,
      promptPrice: "$5.0/M",
    });
    expect(parsed[1].promptPrice).toBe("free");
  });

  it("drops malformed entries and tolerates junk shapes", () => {
    expect(parseCatalog(null)).toEqual([]);
    expect(parseCatalog({ data: [{ name: "no id" }, 42, null] })).toEqual([]);
  });
});
