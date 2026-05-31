import { open } from "@tauri-apps/plugin-dialog";

/**
 * Opens a native folder picker dialog and returns the selected path,
 * or null if the user cancelled.
 */
export async function openFolderDialog(): Promise<string | null> {
  const result = await open({
    directory: true,
    multiple: false,
    recursive: false,
  });
  if (typeof result === "string" && result.length > 0) return result;
  return null;
}
