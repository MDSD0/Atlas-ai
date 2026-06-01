const encoder = new TextEncoder();

export const PROOF_PAYLOAD_BYTES = 2_048;
export const PROOF_SUMMARY_BYTES = 256;
export const PROOF_PATH_BYTES = 4_096;
export const PROOF_LIST_ITEMS = 100;
export const PROOF_RUNS = 100;
export const PROOF_EVENTS_PER_RUN = 500;
export const PROOF_ARTIFACTS_PER_RUN = 100;

export type BoundedText = {
  preview: string;
  truncated: boolean;
  originalBytes: number;
};

export type BoundedList<T> = {
  items: T[];
  truncated: boolean;
  originalCount: number;
};

export type ProofVerdictStatus =
  | "passed"
  | "failed"
  | "incomplete"
  | "cancelled";

export type ProofRunStatus = "running" | ProofVerdictStatus;

export type ProofEvent = {
  id: string;
  runId: string;
  sequence: number;
  kind: string;
  startedAt: number;
  finishedAt: number | null;
  summary: BoundedText;
  boundedPayload: BoundedText | null;
};

export type ProofArtifact = {
  id: string;
  runId: string;
  kind: string;
  pathOrCommand: BoundedText;
  contentHash: string;
  boundedPreview: BoundedText | null;
};

export type ProofVerdict = {
  runId: string;
  status: ProofVerdictStatus;
  changedFiles: BoundedList<BoundedText>;
  diagnostics: BoundedList<BoundedText>;
  checks: BoundedList<BoundedText>;
  unresolvedFailures: BoundedList<BoundedText>;
};

export type ProofRun = {
  id: string;
  sessionId: string;
  workspaceRoot: string | null;
  startedAt: number;
  finishedAt: number | null;
  status: ProofRunStatus;
  nextSequence: number;
  events: ProofEvent[];
  eventsDropped: number;
  artifacts: ProofArtifact[];
  artifactsDropped: number;
  verdict: ProofVerdict | null;
};

export function boundText(value: string, maxBytes: number): BoundedText {
  const originalBytes = encoder.encode(value).byteLength;
  if (originalBytes <= maxBytes) {
    return { preview: value, truncated: false, originalBytes };
  }

  let preview = "";
  let used = 0;
  for (const char of value) {
    const size = encoder.encode(char).byteLength;
    if (used + size > maxBytes) break;
    preview += char;
    used += size;
  }
  return { preview, truncated: true, originalBytes };
}

export function boundPayload(
  value: unknown,
  maxBytes = PROOF_PAYLOAD_BYTES,
): BoundedText {
  if (typeof value === "string") return boundText(value, maxBytes);
  try {
    return boundText(JSON.stringify(value) ?? String(value), maxBytes);
  } catch {
    return boundText("[unserializable payload]", maxBytes);
  }
}

export function boundTextList(
  values: readonly string[],
  maxItems = PROOF_LIST_ITEMS,
  maxBytes = PROOF_PAYLOAD_BYTES,
): BoundedList<BoundedText> {
  return {
    items: values.slice(0, maxItems).map((value) => boundText(value, maxBytes)),
    truncated: values.length > maxItems,
    originalCount: values.length,
  };
}

export async function hashProofContent(content: string): Promise<string> {
  const bytes = encoder.encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function proofArtifactId(
  runId: string,
  kind: string,
  pathOrCommand: string,
): Promise<string> {
  const hash = await hashProofContent(`${kind}\0${pathOrCommand}`);
  return `${runId}:artifact:${hash.slice(0, 24)}`;
}
