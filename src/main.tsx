import "@fontsource-variable/orbitron";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/cyrillic-400.css";
import "@fontsource/jetbrains-mono/cyrillic-700.css";
import "@xterm/xterm/css/xterm.css";
import "./styles/globals.css";

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { initLaunchDir } from "./lib/launchDir";
import { USE_CUSTOM_WINDOW_CONTROLS } from "./lib/platform";

if (USE_CUSTOM_WINDOW_CONTROLS) {
  document.documentElement.dataset.chrome = "borderless";
}

// Render the application immediately
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

// Perform Tauri initializations and window show asynchronously in the background.
// This guarantees the app is mounted and the window is displayed even if backend IPC commands are slow or hang.
(async () => {
  // Reap PTY sessions orphaned by a prior webview load before any tab spawns.
  try {
    await invoke("pty_close_all");
  } catch (e) {
    console.error("pty_close_all failed:", e);
  }

  // Seed default tab mount directory.
  try {
    await initLaunchDir();
  } catch (e) {
    console.error("initLaunchDir failed:", e);
  }
})();

// Window starts hidden (per tauri.conf.json) so users never see a transparent
// shadow-only frame before React paints. Use setTimeout — rAF is throttled
// while the window is hidden and would never fire.
const showWindow = () => {
  getCurrentWindow()
    .show()
    .catch((e) => console.error("window.show failed:", e));
};
setTimeout(showWindow, 50);
// Safety net: if the first show somehow fails to take effect, force again.
setTimeout(showWindow, 500);
