import {
  agentNative,
  type LspDiagnosticsResponse,
} from "../lib/native";

export type PostEditDiagnostics =
  | LspDiagnosticsResponse
  | {
      provider: null;
      status: "not_applicable";
      file: string;
      diagnostics: [];
      waited_ms: 0;
      detail: string;
    }
  | {
      provider: "typescript";
      status: "unavailable";
      file: string;
      diagnostics: [];
      waited_ms: 0;
      detail: string;
    };

export function supportsPostEditDiagnostics(path: string): boolean {
  return /\.(?:js|jsx|mjs|cjs|ts|mts|cts|tsx)$/i.test(path);
}

export async function refreshPostEditDiagnostics(
  projectRoot: string,
  file: string,
): Promise<PostEditDiagnostics> {
  if (!supportsPostEditDiagnostics(file)) {
    return {
      provider: null,
      status: "not_applicable",
      file,
      diagnostics: [],
      waited_ms: 0,
      detail: "no post-edit semantic adapter is registered for this file",
    };
  }
  try {
    return await agentNative.lspDiagnostics(projectRoot, file);
  } catch (error) {
    return {
      provider: "typescript",
      status: "unavailable",
      file,
      diagnostics: [],
      waited_ms: 0,
      detail: String(error),
    };
  }
}
