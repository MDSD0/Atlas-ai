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
      provider: string;
      status: "unavailable";
      file: string;
      diagnostics: [];
      waited_ms: 0;
      detail: string;
    };

export function postEditProvider(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase();
  if (!extension) return null;
  if (["js", "jsx", "mjs", "cjs", "ts", "mts", "cts", "tsx"].includes(extension)) {
    return "typescript";
  }
  if (extension === "py") return "pyright";
  if (extension === "rs") return "rust-analyzer";
  if (["c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx"].includes(extension)) {
    return "clangd";
  }
  if (extension === "java") return "jdtls";
  if (["html", "htm"].includes(extension)) return "html";
  if (["css", "scss", "less"].includes(extension)) return "css";
  if (["json", "jsonc"].includes(extension)) return "json";
  return null;
}

export function supportsPostEditDiagnostics(path: string): boolean {
  return postEditProvider(path) !== null;
}

export async function refreshPostEditDiagnostics(
  projectRoot: string,
  file: string,
): Promise<PostEditDiagnostics> {
  const provider = postEditProvider(file);
  if (!provider) {
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
      provider,
      status: "unavailable",
      file,
      diagnostics: [],
      waited_ms: 0,
      detail: String(error),
    };
  }
}
