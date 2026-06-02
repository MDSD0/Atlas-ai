import { redactSensitive } from "@/modules/ai/lib/redact";

export const METRICS_STORE_PATH = "atlas-ai-metrics.json";
export const METRIC_RECORD_LIMIT = 1000;
export const METRIC_EXPORT_LIMIT = 500;
export const METRIC_NAME_BYTES = 96;
export const METRIC_ATTRIBUTE_ITEMS = 12;
export const METRIC_ATTRIBUTE_BYTES = 128;

export type MetricAttribute = string | number | boolean;

export type LocalMetricRecord = {
  id: string;
  name: string;
  value: number;
  unit: "count" | "ms";
  attributes: Record<string, MetricAttribute>;
  recordedAt: number;
};

export type RecordMetricInput = {
  name: string;
  value: number;
  unit: "count" | "ms";
  attributes?: Readonly<Record<string, MetricAttribute>>;
};

const METRIC_NAME_PATTERN = /^[a-z][a-z0-9_.-]*$/;
const ATTRIBUTE_NAME_PATTERN = /^[a-z][a-z0-9_.-]*$/;

function boundedText(value: string, field: string, maxBytes: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  if (new TextEncoder().encode(trimmed).byteLength > maxBytes) {
    throw new Error(`${field} exceeds ${maxBytes} bytes`);
  }
  if (redactSensitive(trimmed) !== trimmed) {
    throw new Error(`${field} contains possible secret material`);
  }
  return trimmed;
}

export function validateMetricInput(input: RecordMetricInput): RecordMetricInput {
  const name = boundedText(input.name, "metric name", METRIC_NAME_BYTES);
  if (!METRIC_NAME_PATTERN.test(name)) throw new Error("invalid metric name");
  if (!Number.isFinite(input.value)) throw new Error("metric value must be finite");
  const entries = Object.entries(input.attributes ?? {});
  if (entries.length > METRIC_ATTRIBUTE_ITEMS) throw new Error("too many metric attributes");
  const attributes: Record<string, MetricAttribute> = {};
  for (const [key, raw] of entries) {
    if (!ATTRIBUTE_NAME_PATTERN.test(key)) throw new Error("invalid metric attribute name");
    attributes[key] = typeof raw === "string"
      ? boundedText(raw, `metric attribute ${key}`, METRIC_ATTRIBUTE_BYTES)
      : raw;
  }
  return { name, value: input.value, unit: input.unit, attributes };
}
