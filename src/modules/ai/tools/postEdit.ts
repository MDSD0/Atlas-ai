import { invalidateMemoryForPaths } from "@/modules/ai/memory";
import {
  refreshPostEditDiagnostics,
  type PostEditDiagnostics,
} from "@/modules/ai/tools/postEditDiagnostics";

export async function observePostEdit(
  projectRoot: string,
  path: string,
): Promise<{
  post_edit_diagnostics: PostEditDiagnostics;
  memory_invalidation: Awaited<ReturnType<typeof invalidateMemoryForPaths>>;
}> {
  const [postEditDiagnostics, memoryInvalidation] = await Promise.all([
    refreshPostEditDiagnostics(projectRoot, path),
    invalidateMemoryForPaths(projectRoot, [path]),
  ]);
  return {
    post_edit_diagnostics: postEditDiagnostics,
    memory_invalidation: memoryInvalidation,
  };
}
