import {
  METRIC_EXPORT_LIMIT,
  METRIC_RECORD_LIMIT,
  type LocalMetricRecord,
  type RecordMetricInput,
  validateMetricInput,
} from "@/modules/ai/metrics/contracts";
import type { MetricsPersistence } from "@/modules/ai/metrics/persistence";

const RECORDS_KEY = "records";

export type LocalMetricsOptions = {
  clock?: () => number;
  idFactory?: () => string;
  maxRecords?: number;
};

export class LocalMetrics {
  private writes: Promise<void> = Promise.resolve();
  private readonly clock: () => number;
  private readonly idFactory: () => string;
  private readonly maxRecords: number;

  constructor(
    private readonly persistence: MetricsPersistence,
    options: LocalMetricsOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => `metric-${crypto.randomUUID()}`);
    this.maxRecords = options.maxRecords ?? METRIC_RECORD_LIMIT;
  }

  record(input: RecordMetricInput): Promise<LocalMetricRecord> {
    return this.mutate(async () => {
      const validated = validateMetricInput(input);
      const record: LocalMetricRecord = {
        id: this.idFactory(),
        ...validated,
        attributes: validated.attributes ?? {},
        recordedAt: this.clock(),
      };
      const records = await this.listUnlocked();
      await this.persist([record, ...records].slice(0, this.maxRecords));
      return record;
    });
  }

  async list(limit = METRIC_EXPORT_LIMIT): Promise<LocalMetricRecord[]> {
    await this.writes;
    return (await this.listUnlocked()).slice(0, Math.max(1, Math.min(limit, METRIC_EXPORT_LIMIT)));
  }

  async status() {
    await this.writes;
    const records = await this.listUnlocked();
    return {
      provider: "local_metrics",
      export: "explicit_local_only",
      retained: records.length,
      limit: this.maxRecords,
      latestAt: records[0]?.recordedAt ?? null,
      names: [...new Set(records.map((record) => record.name))].sort(),
    };
  }

  private async listUnlocked(): Promise<LocalMetricRecord[]> {
    return (await this.persistence.get<LocalMetricRecord[]>(RECORDS_KEY)) ?? [];
  }

  private async persist(records: LocalMetricRecord[]): Promise<void> {
    await this.persistence.set(RECORDS_KEY, records);
    await this.persistence.save();
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
