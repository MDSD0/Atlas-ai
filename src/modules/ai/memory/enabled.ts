import { emit, listen } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("atlas-ai-memory-settings.json", {
  defaults: { enabled: true },
  autoSave: 200,
});
const EVENT = "atlas://memory-enabled-changed";
let cached: boolean | null = null;
let listening = false;

async function ensureListener(): Promise<void> {
  if (listening) return;
  listening = true;
  await listen<boolean>(EVENT, (event) => {
    cached = event.payload;
  });
}

export async function isMemoryEnabled(): Promise<boolean> {
  await ensureListener();
  if (cached === null) cached = (await store.get<boolean>("enabled")) ?? true;
  return cached;
}

export async function setMemoryEnabled(enabled: boolean): Promise<void> {
  cached = enabled;
  await store.set("enabled", enabled);
  await store.save();
  await emit(EVENT, enabled);
}
