import { describe, expect, it } from "vitest";
import { buildStableSystem } from "./agent";
import { DEFAULT_MODEL_ID } from "../config";
import type { PackedContextSource } from "../contextLedger";

const SOURCES: PackedContextSource[] = [
  { id: "atlas_md", label: "ATLAS.md", source: "ws", content: "Atlas project rules." },
  {
    id: "memory_index",
    label: "MEMORY.md",
    source: "idx",
    content: "MEM_INDEX_MARKER recent decisions.",
  },
  {
    id: "simplemem_context",
    label: "SimpleMem context",
    source: "sm",
    content: "SIMPLEMEM_MARKER retrieved fact.",
  },
];

describe("prompt-layer split", () => {
  it("keeps volatile memory out of the cacheable stable prefix", () => {
    const { stableText, volatileText } = buildStableSystem(
      DEFAULT_MODEL_ID,
      null,
      undefined,
      null,
      SOURCES,
    );
    expect(stableText).not.toContain("MEM_INDEX_MARKER");
    expect(stableText).not.toContain("SIMPLEMEM_MARKER");
    expect(volatileText).toContain("MEM_INDEX_MARKER");
    expect(volatileText).toContain("SIMPLEMEM_MARKER");
  });

  it("labels each volatile layer honestly instead of one PROJECT — ATLAS.md blob", () => {
    const { volatileText } = buildStableSystem(
      DEFAULT_MODEL_ID,
      null,
      undefined,
      null,
      SOURCES,
    );
    expect(volatileText).toContain("## ATLAS.md");
    expect(volatileText).toContain("## MEMORY.md");
    expect(volatileText).toContain("## SimpleMem context");
    // The old mislabel must not wrap memory/simplemem under an ATLAS.md heading.
    expect(volatileText).not.toContain("## PROJECT — ATLAS.md");
  });

  it("keeps session-stable persona/custom in the cached prefix", () => {
    const { stableText, volatileText } = buildStableSystem(
      DEFAULT_MODEL_ID,
      { name: "Builder", instructions: "PERSONA_MARKER" },
      "CUSTOM_MARKER",
      null,
      [],
    );
    expect(stableText).toContain("PERSONA_MARKER");
    expect(stableText).toContain("CUSTOM_MARKER");
    expect(volatileText).toBeNull();
  });

  it("falls back to a generic heading when only the joined string is available", () => {
    const { volatileText } = buildStableSystem(
      DEFAULT_MODEL_ID,
      null,
      undefined,
      "JOINED_FALLBACK",
      [],
    );
    expect(volatileText).toContain("## PROJECT CONTEXT");
    expect(volatileText).toContain("JOINED_FALLBACK");
  });
});
