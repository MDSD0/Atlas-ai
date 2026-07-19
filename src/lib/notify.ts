import { toast } from "sonner";

/** Non-blocking error surface. Replaces window.alert(), which froze the
 * whole webview and looked broken inside a desktop app. */
export function notifyError(message: string): void {
  toast.error(message);
}
