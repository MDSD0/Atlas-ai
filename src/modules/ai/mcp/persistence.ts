import { LazyStore } from "@tauri-apps/plugin-store";
import { MCP_STORE_PATH } from "@/modules/ai/mcp/contracts";

export interface McpPersistence {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export class TauriMcpPersistence implements McpPersistence {
  private readonly store = new LazyStore(MCP_STORE_PATH, {
    defaults: {},
    autoSave: false,
  });

  get<T>(key: string): Promise<T | undefined> {
    return this.store.get<T>(key);
  }

  set(key: string, value: unknown): Promise<void> {
    return this.store.set(key, value);
  }

  save(): Promise<void> {
    return this.store.save();
  }
}
