import { describe, expect, it } from "vitest";
import {
  commandFailureRecovery,
  interactiveEofHint,
  verificationRecovery,
} from "./verificationLoop";

describe("verificationRecovery (diff-as-feedback loop)", () => {
  it("emits a directive when a recognized check fails", () => {
    for (const cmd of [
      "pnpm test",
      "npx vitest run",
      "pytest -q",
      "npx tsc --noEmit",
      "cargo test",
      "npm run lint",
      "go test ./...",
    ]) {
      const r = verificationRecovery(cmd, 1);
      expect(r, cmd).toBeTruthy();
      expect(r!.toLowerCase()).toContain("re-run");
    }
  });

  it("stays silent when the recognized check passes", () => {
    expect(verificationRecovery("pnpm test", 0)).toBeNull();
    expect(verificationRecovery("cargo test", 0)).toBeNull();
  });

  it("does not annotate non-verification commands", () => {
    expect(verificationRecovery("echo hi", 1)).toBeNull();
    expect(verificationRecovery("ls -la", 2)).toBeNull();
    expect(verificationRecovery("python app.py", 1)).toBeNull(); // running, not checking
    expect(verificationRecovery("git status", 1)).toBeNull();
  });

  it("ignores unknown/null exit codes (e.g. timeouts)", () => {
    expect(verificationRecovery("pnpm test", null)).toBeNull();
  });
});

describe("commandFailureRecovery", () => {
  it("marks ordinary failed commands as incomplete", () => {
    expect(commandFailureRecovery("npm install", 1, "network failed")).toContain(
      "COMMAND FAILED",
    );
  });

  it("gives a specific recovery for Windows shell separator failures", () => {
    expect(
      commandFailureRecovery(
        "cd app && npm install",
        1,
        "The token '&&' is not a valid statement separator in this version.",
      ),
    ).toContain("rejected '&&'");
  });
});

describe("interactiveEofHint (stdin-less REPL is not a build failure)", () => {
  it("annotates a Python input() EOFError exit", () => {
    const hint = interactiveEofHint(
      1,
      'Traceback (most recent call last):\n  File "main.py", line 110\nEOFError: EOF when reading a line',
    );
    expect(hint).toBeTruthy();
    expect(hint!).toMatch(/not a build or code failure/i);
  });

  it("stays silent for real failures and clean exits", () => {
    expect(interactiveEofHint(1, "ModuleNotFoundError: No module named 'x'")).toBeNull();
    expect(interactiveEofHint(0, "")).toBeNull();
    expect(interactiveEofHint(null, "EOFError")).toBeNull();
  });
});
