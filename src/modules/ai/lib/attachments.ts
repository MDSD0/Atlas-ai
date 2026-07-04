import type { ModelInfo } from "@/modules/ai/config";

export type FileAttachment = {
  id: string;
  name: string;
  kind: "image" | "document" | "text" | "selection";
  mediaType: string;
  url?: string;
  text?: string;
  size: number;
  source?: "terminal" | "editor";
};

export function binaryAttachmentIssue(
  model: Pick<ModelInfo, "label" | "tags">,
  files: readonly FileAttachment[],
): string | null {
  const hasBinary = files.some(
    (file) => file.kind === "image" || file.kind === "document",
  );
  if (!hasBinary || model.tags === undefined || model.tags.includes("vision")) {
    return null;
  }
  return `${model.label} is not marked for image or PDF input. Remove the binary attachment or choose a vision-capable model.`;
}

export const MAX_TEXT_INLINE = 200_000;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 8;
export const ACCEPTED_FILES =
  "image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,application/pdf,.pdf,.txt,.md,.json,.yaml,.yml,.toml,.sh,.zsh,.bash,.py,.js,.jsx,.ts,.tsx,.rs,.go,.java,.c,.cpp,.h,.hpp,.html,.css,.csv,.log,.config,.conf,.ini,Dockerfile,.dockerfile";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "yaml", "yml", "toml", "sh", "zsh", "bash",
  "py", "js", "jsx", "ts", "tsx", "rs", "go", "java", "c", "cpp",
  "h", "hpp", "html", "css", "csv", "log", "config", "conf", "ini",
  "dockerfile",
]);

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
};
const RASTER_IMAGE_MEDIA_TYPES = new Set(Object.values(IMAGE_MEDIA_TYPES));

export type AttachmentClassification =
  | { kind: "image" | "document" | "text"; mediaType: string }
  | { error: string };

function extension(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  if (base === "dockerfile" || base.endsWith(".dockerfile")) return "dockerfile";
  const index = base.lastIndexOf(".");
  return index >= 0 ? base.slice(index + 1) : "";
}

export function classifyAttachment(file: Pick<File, "name" | "type" | "size">): AttachmentClassification {
  const ext = extension(file.name);
  const mediaType = file.type.toLowerCase();

  const inferredImageType = IMAGE_MEDIA_TYPES[ext];
  if (RASTER_IMAGE_MEDIA_TYPES.has(mediaType) || inferredImageType) {
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: `${file.name} exceeds the 3 MB image limit` };
    }
    return { kind: "image", mediaType: mediaType || inferredImageType };
  }
  if (mediaType.startsWith("image/")) {
    return { error: `${file.name} is not a supported raster image` };
  }

  if (mediaType === "application/pdf" || ext === "pdf") {
    if (file.size > MAX_DOCUMENT_BYTES) {
      return { error: `${file.name} exceeds the 5 MB document limit` };
    }
    return { kind: "document", mediaType: "application/pdf" };
  }

  if (TEXT_EXTENSIONS.has(ext) || mediaType.startsWith("text/")) {
    if (file.name.toLowerCase().startsWith(".env")) {
      return { error: `${file.name} is blocked because it commonly contains secrets` };
    }
    if (file.size > MAX_TEXT_INLINE) {
      return { error: `${file.name} exceeds the 200 KB text limit` };
    }
    return { kind: "text", mediaType: mediaType || "text/plain" };
  }

  return { error: `${file.name} is not a supported image, PDF, or text file` };
}

export async function readAttachment(
  file: File,
): Promise<{ attachment?: FileAttachment; error?: string }> {
  const classification = classifyAttachment(file);
  if ("error" in classification) return classification;

  const id = `${file.name}-${file.size}-${file.lastModified}`;
  if (classification.kind === "text") {
    return {
      attachment: {
        id,
        name: file.name,
        kind: "text",
        mediaType: classification.mediaType,
        text: await file.text(),
        size: file.size,
      },
    };
  }

  return {
    attachment: {
      id,
      name: file.name,
      kind: classification.kind,
      mediaType: classification.mediaType,
      url: await readAsDataURL(file),
      size: file.size,
    },
  };
}

export function mergeAttachments(
  current: readonly FileAttachment[],
  incoming: readonly FileAttachment[],
): {
  files: FileAttachment[];
  duplicateCount: number;
  overflowCount: number;
  totalBytesExceededCount: number;
} {
  const files = [...current];
  const ids = new Set(files.map((file) => file.id));
  let totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  let duplicateCount = 0;
  let overflowCount = 0;
  let totalBytesExceededCount = 0;

  for (const file of incoming) {
    if (ids.has(file.id)) {
      duplicateCount += 1;
      continue;
    }
    if (files.length >= MAX_ATTACHMENTS) {
      overflowCount += 1;
      continue;
    }
    if (totalBytes + file.size > MAX_ATTACHMENT_BYTES) {
      totalBytesExceededCount += 1;
      continue;
    }
    ids.add(file.id);
    files.push(file);
    totalBytes += file.size;
  }

  return { files, duplicateCount, overflowCount, totalBytesExceededCount };
}

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
