import { describe, expect, it } from "vitest";
import {
  foregroundCommandBlockReason,
  redactShellOutput,
  sensitiveShellOutputBlockReason,
} from "./shell";

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
