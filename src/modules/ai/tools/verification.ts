import { tool } from "ai";
import { z } from "zod";

export type VerificationSuggestion = {
  command: string;
  reason: string;
};

export function suggestVerification(
  changedFiles: readonly string[],
): VerificationSuggestion[] {
  const suggestions: VerificationSuggestion[] = [];
  const add = (command: string, reason: string) => {
    if (!suggestions.some((suggestion) => suggestion.command === command)) {
      suggestions.push({ command, reason });
    }
  };

  add("git diff --check", "detect whitespace and patch formatting errors");
  if (
    changedFiles.some((file) =>
      /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/.test(file),
    )
  ) {
    add("pnpm exec tsc --noEmit", "type-check TypeScript changes");
    add("pnpm test", "run the frontend regression suite");
  }
  if (changedFiles.some((file) => file.endsWith(".rs"))) {
    add(
      "cargo test --locked --manifest-path src-tauri/Cargo.toml",
      "run native regression tests",
    );
  }
  return suggestions;
}

export function buildVerificationTools() {
  return {
    verification_plan: tool({
      description:
        "Suggest verification commands for changed files. Suggestions are not executed and never count as verification receipts.",
      inputSchema: z.object({
        changed_files: z.array(z.string()).max(100),
      }),
      execute: async ({ changed_files }) => ({
        changed_files,
        suggestions: suggestVerification(changed_files),
        executed: false,
      }),
    }),
  } as const;
}
