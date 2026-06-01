import { describe, expect, it } from "vitest";
import { suggestVerification } from "./verification";

describe("suggestVerification", () => {
  it("always suggests the diff whitespace check", () => {
    expect(suggestVerification(["README.md"])).toEqual([
      {
        command: "git diff --check",
        reason: "detect whitespace and patch formatting errors",
      },
    ]);
  });

  it("deduplicates frontend and native checks", () => {
    expect(suggestVerification(["src/a.ts", "src/b.tsx", "src/lib.rs"])).toEqual([
      {
        command: "git diff --check",
        reason: "detect whitespace and patch formatting errors",
      },
      {
        command: "pnpm exec tsc --noEmit",
        reason: "type-check TypeScript changes",
      },
      {
        command: "pnpm test",
        reason: "run the frontend regression suite",
      },
      {
        command: "cargo test --locked --manifest-path src-tauri/Cargo.toml",
        reason: "run native regression tests",
      },
    ]);
  });
});
