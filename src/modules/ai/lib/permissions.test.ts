import { describe, expect, it } from "vitest";
import {
  editNeedsApproval,
  isAutoRunShell,
  shellNeedsApproval,
} from "./permissions";

describe("isAutoRunShell", () => {
  it("auto-runs single safe read-only / open commands", () => {
    expect(isAutoRunShell("open index.html")).toBe(true);
    expect(isAutoRunShell("ls -la")).toBe(true);
    expect(isAutoRunShell("cat README.md")).toBe(true);
    expect(isAutoRunShell("git status")).toBe(true);
    expect(isAutoRunShell("git log --oneline")).toBe(true);
  });

  it("does not auto-run mutating or unknown commands", () => {
    expect(isAutoRunShell("rm file.txt")).toBe(false);
    expect(isAutoRunShell("npm install")).toBe(false);
    expect(isAutoRunShell("git push")).toBe(false);
    expect(isAutoRunShell("python -m http.server")).toBe(false);
  });

  it("never auto-runs commands with shell operators (no compounding)", () => {
    expect(isAutoRunShell("ls && rm -rf /")).toBe(false);
    expect(isAutoRunShell("cat f | sh")).toBe(false);
    expect(isAutoRunShell("open x; rm y")).toBe(false);
    expect(isAutoRunShell("echo $(rm -rf /)")).toBe(false);
    expect(isAutoRunShell("cat > secret")).toBe(false);
  });
});

describe("editNeedsApproval", () => {
  it("prompts in default mode, auto-applies otherwise", () => {
    expect(editNeedsApproval("default")).toBe(true);
    expect(editNeedsApproval("acceptEdits")).toBe(false);
    expect(editNeedsApproval("full")).toBe(false);
  });
});

describe("shellNeedsApproval", () => {
  it("prompts for non-trivial commands except in full access", () => {
    expect(shellNeedsApproval("npm install", "default")).toBe(true);
    expect(shellNeedsApproval("npm install", "acceptEdits")).toBe(true);
    expect(shellNeedsApproval("npm install", "full")).toBe(false);
  });

  it("auto-runs safe read-only / open commands in every mode", () => {
    expect(shellNeedsApproval("open index.html", "default")).toBe(false);
    expect(shellNeedsApproval("ls", "acceptEdits")).toBe(false);
    expect(shellNeedsApproval("git status", "default")).toBe(false);
  });

  it("does not let full-access mode auto-skip a compounded command's prompt path via the allow-list", () => {
    // A compounded command is not auto-run; full access still skips the prompt,
    // but the execute-time circuit breaker (checkShellCommand) is the guard
    // that blocks it. The allow-list itself must never classify it as safe.
    expect(isAutoRunShell("open x && rm -rf /")).toBe(false);
  });
});
