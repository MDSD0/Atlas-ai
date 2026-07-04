import { describe, expect, it } from "vitest";
import {
  editNeedsApproval,
  isAutoRunShell,
  shellNeedsApproval,
} from "./permissions";

describe("isAutoRunShell", () => {
  it("auto-runs only bounded read-only / open commands", () => {
    expect(isAutoRunShell("open index.html")).toBe(true);
    expect(isAutoRunShell("ls -la")).toBe(true);
    expect(isAutoRunShell("git status")).toBe(true);
    expect(isAutoRunShell("git status --short --branch")).toBe(true);
    expect(isAutoRunShell("pwd")).toBe(true);
  });

  it("does not auto-run shell reads that bypass Atlas path guards", () => {
    expect(isAutoRunShell("cat README.md")).toBe(false);
    expect(isAutoRunShell("cat ~/.ssh/id_rsa")).toBe(false);
    expect(isAutoRunShell("rg token ~")).toBe(false);
    expect(isAutoRunShell("printenv")).toBe(false);
  });

  it("does not auto-run mutating wrappers or argument shapes", () => {
    expect(isAutoRunShell("rm file.txt")).toBe(false);
    expect(isAutoRunShell("npm install")).toBe(false);
    expect(isAutoRunShell("git push")).toBe(false);
    expect(isAutoRunShell("git branch -D old")).toBe(false);
    expect(isAutoRunShell("git remote remove origin")).toBe(false);
    expect(isAutoRunShell("find . -delete")).toBe(false);
    expect(isAutoRunShell("diff --output=changed a b")).toBe(false);
    expect(isAutoRunShell("env rm -rf /")).toBe(false);
    expect(isAutoRunShell("python -m http.server")).toBe(false);
  });

  it("only auto-runs a simple relative open target", () => {
    expect(isAutoRunShell("open ./dist/index.html")).toBe(true);
    expect(isAutoRunShell("open ../outside.html")).toBe(false);
    expect(isAutoRunShell("open /tmp/outside.html")).toBe(false);
    expect(isAutoRunShell("open https://example.com")).toBe(false);
    expect(isAutoRunShell("open -a Terminal index.html")).toBe(false);
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
  it("prompts for non-trivial commands in every product mode", () => {
    expect(shellNeedsApproval("npm install", "default")).toBe(true);
    expect(shellNeedsApproval("npm install", "acceptEdits")).toBe(true);
    expect(shellNeedsApproval("npm install", "full")).toBe(true);
    expect(shellNeedsApproval("npm install", "benchmark")).toBe(false);
  });

  it("auto-runs safe read-only / open commands in every mode", () => {
    expect(shellNeedsApproval("open index.html", "default")).toBe(false);
    expect(shellNeedsApproval("ls", "acceptEdits")).toBe(false);
    expect(shellNeedsApproval("git status", "default")).toBe(false);
  });

  it("never classifies a compounded command as safe", () => {
    expect(isAutoRunShell("open x && rm -rf /")).toBe(false);
  });
});
