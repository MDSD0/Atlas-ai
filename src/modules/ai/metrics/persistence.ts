import { LazyStore } from "@tauri-apps/plugin-store";
import { METRICS_STORE_PATH } from "@/modules/ai/metrics/contracts";

export interface MetricsPersistence {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export class TauriMetricsPersistence implements MetricsPersistence {
  private readonly store = new LazyStore(METRICS_STORE_PATH, {
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
