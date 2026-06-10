const MAX_AGENT_ERROR_LENGTH = 360;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

function compact(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_AGENT_ERROR_LENGTH) return collapsed;
  return `${collapsed.slice(0, MAX_AGENT_ERROR_LENGTH - 3).trimEnd()}...`;
}

/**
 * Whether a run error is a transient mid-stream failure (provider dropped or
 * corrupted the SSE stream, network blip) that is safe to auto-resume once.
 * Deliberately conservative: anything that smells like auth, billing, quota,
 * rate limiting, a missing model, context overflow, or a user abort is NOT
 * transient — auto-retrying those wastes money or fights the user.
 */
export function isTransientStreamError(error: unknown): boolean {
  const lower = compact(errorText(error)).toLowerCase();
  if (!lower) return false;

  const nonRetryable = [
    "401", "402", "403", "404", "429",
    "credit", "quota", "rate limit", "billing",
    "invalid api key", "unauthorized", "forbidden",
    "model not found", "does not exist",
    "context length", "maximum context", "output limit",
    "abort", // user-initiated stop must never auto-resume
    "tool_use_failed",
  ];
  if (nonRetryable.some((s) => lower.includes(s))) return false;

  const transient = [
    "sse stream", "injected into sse",
    "json pars", "invalid json", "unexpected token",
    "type validation failed",
    "econnreset", "socket hang up", "premature close",
    "terminated", "network error", "stream error",
  ];
  return transient.some((s) => lower.includes(s));
}

export function formatAgentError(error: unknown): string {
  const raw = compact(errorText(error));
  const lower = raw.toLowerCase();

  if (!raw) return "Run failed.";

  if (
    lower.includes("402") ||
    lower.includes("credit") ||
    lower.includes("can only afford") ||
    lower.includes("insufficient balance")
  ) {
    return "Provider credits are exhausted. Add credits, lower the output limit, or switch provider/model.";
  }

  if (
    lower.includes("insufficient_quota") ||
    lower.includes("quota exceeded") ||
    lower.includes("billing hard limit")
  ) {
    return "Provider quota is exhausted. Switch provider/model or update billing before retrying.";
  }

  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Provider rate limit hit. Wait a bit, lower concurrency, or switch provider/model.";
  }

  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    return "Provider rejected the API key or account access. Check the key, billing, and selected provider.";
  }

  if (lower.includes("tool_use_failed")) {
    return "Provider rejected the model's tool-call format. Try a stronger tool-calling model or a different provider.";
  }

  if (
    lower.includes("model not found") ||
    lower.includes("does not exist") ||
    lower.includes("not a valid model") ||
    lower.includes("404")
  ) {
    return "Selected model is unavailable for this provider. Pick another model and retry.";
  }

  if (
    lower.includes("context length") ||
    lower.includes("maximum context") ||
    lower.includes("max_tokens") ||
    lower.includes("output limit")
  ) {
    return "Provider context or output limit was reached. Reduce context or lower the output limit.";
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("connection refused") ||
    lower.includes("failed to connect")
  ) {
    return "Provider endpoint is unreachable. Check the local server/base URL and retry.";
  }

  return raw;
}
