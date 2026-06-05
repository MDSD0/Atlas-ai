import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { native } from "../lib/native";
import {
  beginRunResources,
  configureRunResourceKillerForTests,
  resetRunResourcesForTests,
} from "../lib/runResources";
import {
  buildShellTools,
  foregroundCommandBlockReason,
  redactShellOutput,
  sensitiveShellOutputBlockReason,
} from "./shell";
import type { ToolContext } from "./context";

const killedHandles: number[] = [];

beforeEach(() => {
  killedHandles.length = 0;
  configureRunResourceKillerForTests((handle) => {
    killedHandles.push(handle);
  });
});

afterEach(() => {
  resetRunResourcesForTests();
  vi.restoreAllMocks();
});

describe("foregroundCommandBlockReason", () => {
  it("blocks obvious dev servers and watchers in bash_run", () => {
    expect(foregroundCommandBlockReason("python -m http.server")).toContain(
      "bash_background",
    );
    expect(foregroundCommandBlockReason("pnpm dev")).toContain(
      "bash_background",
    );
    expect(foregroundCommandBlockReason("npm run dev")).toContain(
      "bash_background",
    );
    expect(foregroundCommandBlockReason("cargo watch -x test")).toContain(
      "bash_background",
    );
  });

  it("allows short-lived verification commands", () => {
    expect(foregroundCommandBlockReason("pnpm build")).toBeNull();
    expect(foregroundCommandBlockReason("npm test -- --runInBand")).toBeNull();
    expect(foregroundCommandBlockReason("python scripts/check.py")).toBeNull();
  });
});

describe("sensitiveShellOutputBlockReason", () => {
  it("blocks whole-environment dumps", () => {
    expect(sensitiveShellOutputBlockReason("env")).toContain("environment");
    expect(sensitiveShellOutputBlockReason("printenv | sort")).toContain(
      "environment",
    );
    expect(sensitiveShellOutputBlockReason("Get-ChildItem env:")).toContain(
      "environment",
    );
  });

  it("allows targeted checks", () => {
    expect(sensitiveShellOutputBlockReason("node --version")).toBeNull();
    expect(sensitiveShellOutputBlockReason("echo $PATH")).toBeNull();
  });
});

describe("redactShellOutput", () => {
  it("redacts secret-looking environment assignments and key values", () => {
    const text = [
      "OPENROUTER_API_KEY=sk-or-v1-abcdef",
      "gq1=gsk_abcdef",
      "g1=AQ.Ab8abcdef",
      "plain=ok",
    ].join("\n");

    const redacted = redactShellOutput(text);
    expect(redacted).toContain("OPENROUTER_API_KEY=<REDACTED>");
    expect(redacted).toContain("gq1=<REDACTED>");
    expect(redacted).toContain("g1=<REDACTED>");
    expect(redacted).toContain("plain=ok");
    expect(redacted).not.toContain("sk-or-v1-abcdef");
    expect(redacted).not.toContain("gsk_abcdef");
    expect(redacted).not.toContain("AQ.Ab8abcdef");
  });
});

describe("serve_preview run resources", () => {
  const ctx = (): ToolContext => ({
    getCwd: () => "C:/repo",
    getWorkspaceRoot: () => "C:/repo",
    getProjectContext: () => ({
      projectId: "repo",
      workspaceRoot: "C:/repo",
      projectName: "repo",
      activeFolder: "C:/repo",
      activeFile: null,
      activeSelection: null,
      activeTerminalId: null,
      activeTerminalCwd: null,
      executionCwd: "C:/repo",
      executionCwdMode: "workspace",
    }),
    getTerminalContext: () => null,
    isActiveTerminalPrivate: () => false,
    injectIntoActivePty: () => false,
    openPreview: () => true,
    spawnAgent: () => null,
    readAgentOutput: () => null,
    readCache: new Map(),
    getSessionId: () => "s1",
    getApprovalMode: () => "default",
  });

  it("kills a preview process spawned by the active run when aborted", async () => {
    vi.spyOn(native, "shellBgList").mockResolvedValue([]);
    vi.spyOn(native, "shellBgSpawn").mockResolvedValue(41);
    vi.spyOn(native, "shellBgLogs").mockResolvedValue({
      bytes: "ready",
      next_offset: 5,
      dropped: 0,
      exited: false,
      exit_code: null,
    });
    const controller = new AbortController();
    beginRunResources("s1", controller.signal);

    const result = await buildShellTools(ctx()).serve_preview.execute?.(
      {
        command: "python -m http.server",
        url: "http://localhost:8000",
        wait_ms: 0,
      },
      { abortSignal: controller.signal, toolCallId: "tc-1", messages: [] },
    );
    controller.abort();

    expect(result).toMatchObject({ ok: true, handle: 41, reused: false });
    expect(killedHandles).toEqual([41]);
  });

  it("does not kill a reused preview process on run abort", async () => {
    vi.spyOn(native, "shellBgList").mockResolvedValue([
      {
        handle: 42,
        command: "python -m http.server",
        cwd: "C:/repo",
        started_at_ms: 1,
        exited: false,
        exit_code: null,
      },
    ]);
    vi.spyOn(native, "shellBgSpawn").mockResolvedValue(99);
    vi.spyOn(native, "shellBgLogs").mockResolvedValue({
      bytes: "ready",
      next_offset: 5,
      dropped: 0,
      exited: false,
      exit_code: null,
    });
    const controller = new AbortController();
    beginRunResources("s1", controller.signal);

    const result = await buildShellTools(ctx()).serve_preview.execute?.(
      {
        command: "python -m http.server",
        url: "http://localhost:8000",
        wait_ms: 0,
      },
      { abortSignal: controller.signal, toolCallId: "tc-1", messages: [] },
    );
    controller.abort();

    expect(result).toMatchObject({ ok: true, handle: 42, reused: true });
    expect(native.shellBgSpawn).not.toHaveBeenCalled();
    expect(killedHandles).toEqual([]);
  });
});
