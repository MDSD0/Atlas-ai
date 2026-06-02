import {
  TauriMemoryPersistence,
  type MemoryPersistence,
} from "@/modules/ai/memory/persistence";
import {
  assertLoopbackHttpUrl,
  SIMPLEMEM_DEFAULT_BASE_URL,
  SimpleMemAdapter,
  type SimpleMemAdapterOptions,
} from "@/modules/ai/memory/simpleMem";

const SIMPLEMEM_CONFIG_KEY = "simplemem:config";

export type SimpleMemConfig = {
  enabled: boolean;
  injectContext: boolean;
  baseUrl: string;
  updatedAt: number;
};

export type ConfigureSimpleMemInput = {
  enabled?: boolean;
  injectContext?: boolean;
  baseUrl?: string;
};

export class SimpleMemConfigRegistry {
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly persistence: MemoryPersistence,
    private readonly clock: () => number = Date.now,
  ) {}

  async get(): Promise<SimpleMemConfig> {
    await this.writes;
    return this.getUnlocked();
  }

  configure(input: ConfigureSimpleMemInput): Promise<SimpleMemConfig> {
    return this.mutate(async () => {
      const previous = await this.getUnlocked();
      const endpoint = assertLoopbackHttpUrl(
        input.baseUrl ?? previous.baseUrl,
      );
      const config: SimpleMemConfig = {
        enabled: input.enabled ?? previous.enabled,
        injectContext: input.injectContext ?? previous.injectContext,
        baseUrl: endpoint.origin,
        updatedAt: this.clock(),
      };
      await this.persistence.set(SIMPLEMEM_CONFIG_KEY, config);
      await this.persistence.save();
      return config;
    });
  }

  async adapter(
    overrides: Omit<SimpleMemAdapterOptions, "enabled" | "baseUrl"> & {
      forceEnabled?: boolean;
    } = {},
  ): Promise<SimpleMemAdapter> {
    const config = await this.get();
    const { forceEnabled, ...options } = overrides;
    return new SimpleMemAdapter({
      ...options,
      enabled: forceEnabled ?? config.enabled,
      baseUrl: config.baseUrl,
    });
  }

  private async getUnlocked(): Promise<SimpleMemConfig> {
    const saved =
      await this.persistence.get<Partial<SimpleMemConfig>>(SIMPLEMEM_CONFIG_KEY);
    return saved
      ? {
          enabled: saved.enabled ?? false,
          injectContext: saved.injectContext ?? false,
          baseUrl: saved.baseUrl ?? SIMPLEMEM_DEFAULT_BASE_URL,
          updatedAt: saved.updatedAt ?? 0,
        }
      : {
        enabled: false,
        injectContext: false,
        baseUrl: SIMPLEMEM_DEFAULT_BASE_URL,
        updatedAt: 0,
      };
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation, operation);
    this.writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

export const simpleMemConfig = new SimpleMemConfigRegistry(
  new TauriMemoryPersistence(),
);
