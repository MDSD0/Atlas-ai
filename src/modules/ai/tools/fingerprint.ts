export type ReadFingerprint = { size: number; hash: number };

export const STALE_READ_ERROR =
  "Refused: stale read; file changed since the last read_file call. Call read_file again before editing.";

const utf8Encoder = new TextEncoder();

export function fingerprintText(content: string): ReadFingerprint {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
  }
  return { size: utf8Encoder.encode(content).byteLength, hash: hash >>> 0 };
}

export function fingerprintsMatch(
  a: ReadFingerprint,
  b: ReadFingerprint,
): boolean {
  return a.size === b.size && a.hash === b.hash;
}
