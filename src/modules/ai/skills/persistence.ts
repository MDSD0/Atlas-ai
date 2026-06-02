import { LazyStore } from "@tauri-apps/plugin-store";
import { SKILL_STORE_PATH } from "@/modules/ai/skills/contracts";

export interface SkillPersistence {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export class TauriSkillPersistence implements SkillPersistence {
  private readonly store = new LazyStore(SKILL_STORE_PATH, {
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
