/**
 * Weak models (observed: DeepSeek via OpenRouter) sometimes double-encode tool
 * arguments: the input JSON parses to a *string* that itself contains the JSON
 * object. The SDK then rejects the call with "expected object, received
 * string" and the run derails. Unwrap up to two levels of string-encoding; if
 * an object emerges, return its canonical JSON for re-validation. Returns null
 * when the input is not a recoverable double-encoding (no guessing).
 */
export function unwrapDoubleEncodedInput(input: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return null;
  }
  for (let depth = 0; typeof value === "string" && depth < 2; depth++) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return JSON.stringify(value);
}
