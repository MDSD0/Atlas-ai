import { LazyStore } from "@tauri-apps/plugin-store";
import { WORK_PACKET_STORE_PATH } from "@/modules/ai/workPackets/contracts";

export interface WorkPacketPersistence {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  save(): Promise<void>;
}

export class TauriWorkPacketPersistence implements WorkPacketPersistence {
  private readonly store = new LazyStore(WORK_PACKET_STORE_PATH, {
    defaults: {},
    autoSave: false,
  });

  get<T>(key: string): Promise<T | undefined> {
    return this.store.get<T>(key);
  }

  set(key: string, value: unknown): Promise<void> {
    return this.store.set(key, value);
  }

  delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  save(): Promise<void> {
    return this.store.save();
  }
}
