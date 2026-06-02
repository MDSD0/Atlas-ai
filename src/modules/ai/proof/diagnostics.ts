type DiagnosticLike = {
  range?: {
    start?: { line?: unknown; character?: unknown };
  };
  source?: unknown;
  message?: unknown;
};

type SemanticEvidence = {
  provider?: unknown;
  status?: unknown;
  file?: unknown;
  detail?: unknown;
  diagnostics?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function semanticEvidenceFromToolResult(
  toolName: string,
  output: unknown,
): unknown {
  if (toolName === "lsp_diagnostics") return output;
  return isRecord(output) ? output.post_edit_diagnostics : undefined;
}

export function summarizeDiagnosticEvidence(evidence: unknown): string[] {
  if (!isRecord(evidence)) return [];
  const semantic = evidence as SemanticEvidence;
  const file = typeof semantic.file === "string" ? semantic.file : "unknown";
  const provider =
    typeof semantic.provider === "string" ? semantic.provider : "semantic";
  const status =
    typeof semantic.status === "string" ? semantic.status : "unknown";
  const diagnostics = Array.isArray(semantic.diagnostics)
    ? (semantic.diagnostics as DiagnosticLike[])
    : [];

  if (diagnostics.length === 0) {
    const detail =
      typeof semantic.detail === "string" ? `: ${semantic.detail}` : "";
    return [`${provider} ${file}: ${status}; 0 diagnostics${detail}`];
  }
  return diagnostics.map((diagnostic) => {
    const line = diagnostic.range?.start?.line;
    const character = diagnostic.range?.start?.character;
    const location =
      typeof line === "number" && typeof character === "number"
        ? `${file}:${line + 1}:${character + 1}`
        : file;
    const source =
      typeof diagnostic.source === "string" ? diagnostic.source : provider;
    const message =
      typeof diagnostic.message === "string"
        ? diagnostic.message
        : "diagnostic message unavailable";
    return `${location} ${source}: ${message}`;
  });
}
