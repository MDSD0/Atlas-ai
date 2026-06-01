import { LazyStore } from "@tauri-apps/plugin-store";

export const PROOF_STORE_PATH = "atlas-ai-proof-receipts.json";

export interface ProofPersistence {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  save(): Promise<void>;
}

export class TauriProofPersistence implements ProofPersistence {
  private readonly store = new LazyStore(PROOF_STORE_PATH, {
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
