import { describe, expect, it } from "vitest";
import { micErrorMessage, transcriptionErrorMessage } from "./useWhisperRecording";

describe("micErrorMessage (F-09 edge cases)", () => {
  it("distinguishes permission-denied from other getUserMedia failures", () => {
    expect(micErrorMessage(new DOMException("blocked", "NotAllowedError"))).toContain(
      "denied",
    );
    // Older Safari/webkit name for the same condition.
    expect(micErrorMessage(new DOMException("blocked", "PermissionDeniedError"))).toContain(
      "denied",
    );
  });

  it("reports a distinct message when no microphone device exists", () => {
    expect(micErrorMessage(new DOMException("none", "NotFoundError"))).toContain(
      "No microphone was found",
    );
  });

  it("falls back to a generic message for unrecognized DOMException names", () => {
    expect(micErrorMessage(new DOMException("weird", "AbortError"))).toBe(
      "Couldn't access the microphone.",
    );
  });

  it("falls back to a generic message for non-DOMException errors (e.g. a plain object throw)", () => {
    expect(micErrorMessage(new Error("something else"))).toBe(
      "Couldn't access the microphone.",
    );
    expect(micErrorMessage("a bare string throw")).toBe("Couldn't access the microphone.");
    expect(micErrorMessage(undefined)).toBe("Couldn't access the microphone.");
  });
});

describe("transcriptionErrorMessage (F-09 edge cases)", () => {
  it("uses the Error's message when available", () => {
    expect(transcriptionErrorMessage(new Error("network unreachable"))).toBe(
      "network unreachable",
    );
  });

  it("stringifies non-Error throws", () => {
    expect(transcriptionErrorMessage("plain string error")).toBe("plain string error");
    expect(transcriptionErrorMessage({ code: 500 })).toBe("[object Object]");
  });

  it("truncates very long error messages to 200 chars so a toast can't be flooded", () => {
    const long = "x".repeat(5000);
    const result = transcriptionErrorMessage(new Error(long));
    expect(result.length).toBe(200);
  });
});
