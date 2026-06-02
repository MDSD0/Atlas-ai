import { LocalMetrics } from "@/modules/ai/metrics/localMetrics";
import { TauriMetricsPersistence } from "@/modules/ai/metrics/persistence";

export * from "@/modules/ai/metrics/contracts";
export * from "@/modules/ai/metrics/inspector";
export * from "@/modules/ai/metrics/localMetrics";
export * from "@/modules/ai/metrics/persistence";

export const localMetrics = new LocalMetrics(new TauriMetricsPersistence());

export function recordLocalMetric(
  ...args: Parameters<LocalMetrics["record"]>
): void {
  void localMetrics.record(...args).catch(() => undefined);
}
