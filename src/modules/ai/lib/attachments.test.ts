import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  binaryAttachmentIssue,
  classifyAttachment,
  mergeAttachments,
  type FileAttachment,
} from "@/modules/ai/lib/attachments";

function file(name: string, type: string, size: number) {
  return { name, type, size } as File;
}

function attachment(id: string): FileAttachment {
  return {
    id,
    name: `${id}.png`,
    kind: "image",
    mediaType: "image/png",
    url: "data:image/png;base64,AA==",
    size: 1,
  };
}

describe("attachment classification", () => {
  it("rejects known text-only models while preserving custom-model capability", () => {
    const image = attachment("screen");
    expect(
      binaryAttachmentIssue(
        { label: "Text model", tags: ["tools"] },
        [image],
      ),
    ).toContain("not marked");
    expect(
      binaryAttachmentIssue(
        { label: "Vision model", tags: ["vision", "tools"] },
        [image],
      ),
    ).toBeNull();
    expect(
      binaryAttachmentIssue({ label: "Custom local model" }, [image]),
    ).toBeNull();
  });

  it("accepts images by MIME or extension and PDFs as documents", () => {
    expect(classifyAttachment(file("shot.bin", "image/png", 10))).toEqual({
      kind: "image",
      mediaType: "image/png",
    });
    expect(classifyAttachment(file("shot.webp", "", 10))).toEqual({
      kind: "image",
      mediaType: "image/webp",
    });
    expect(classifyAttachment(file("requirements.pdf", "", 10))).toEqual({
      kind: "document",
      mediaType: "application/pdf",
    });
  });

  it("accepts known text files but blocks secret and binary formats", () => {
    expect(classifyAttachment(file("main.ts", "", 10))).toEqual({
      kind: "text",
      mediaType: "text/plain",
    });
    expect(classifyAttachment(file(".env", "text/plain", 10))).toHaveProperty("error");
    expect(classifyAttachment(file("report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 10))).toHaveProperty("error");
  });

  it("rejects oversized images, PDFs, and text before reading them", () => {
    expect(classifyAttachment(file("huge.png", "image/png", 3 * 1024 * 1024 + 1))).toHaveProperty("error");
    expect(classifyAttachment(file("huge.pdf", "application/pdf", 5 * 1024 * 1024 + 1))).toHaveProperty("error");
    expect(classifyAttachment(file("huge.txt", "text/plain", 200_001))).toHaveProperty("error");
  });

  it("rejects active and browser-incompatible image formats", () => {
    expect(classifyAttachment(file("active.svg", "image/svg+xml", 10))).toHaveProperty("error");
    expect(classifyAttachment(file("photo.heic", "image/heic", 10))).toHaveProperty("error");
  });
});

describe("mergeAttachments", () => {
  it("deduplicates stable file identities", () => {
    const result = mergeAttachments([attachment("a")], [attachment("a"), attachment("b")]);
    expect(result.files.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.duplicateCount).toBe(1);
  });

  it("enforces the shared attachment cap", () => {
    const current = Array.from({ length: MAX_ATTACHMENTS - 1 }, (_, index) => attachment(`old-${index}`));
    const result = mergeAttachments(current, [attachment("new-1"), attachment("new-2")]);
    expect(result.files).toHaveLength(MAX_ATTACHMENTS);
    expect(result.overflowCount).toBe(1);
  });

  it("enforces an aggregate byte cap across otherwise valid files", () => {
    const first = { ...attachment("first"), size: MAX_ATTACHMENT_BYTES - 1 };
    const second = { ...attachment("second"), size: 2 };
    const result = mergeAttachments([first], [second]);
    expect(result.files).toHaveLength(1);
    expect(result.totalBytesExceededCount).toBe(1);
  });
});
