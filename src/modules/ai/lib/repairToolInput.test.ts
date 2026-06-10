import { describe, expect, it } from "vitest";
import { unwrapDoubleEncodedInput } from "./repairToolInput";

describe("unwrapDoubleEncodedInput (weak-model tool-call repair)", () => {
  it("unwraps the exact DeepSeek double-encoding from the failed run", () => {
    // The provider sent input as a JSON *string* containing the object.
    const inner =
      '{"path":"pages/_app.js","content":"import \'../styles/globals.css\'"}';
    const doubleEncoded = JSON.stringify(inner);
    const repaired = unwrapDoubleEncodedInput(doubleEncoded);
    expect(repaired).not.toBeNull();
    expect(JSON.parse(repaired!)).toEqual({
      path: "pages/_app.js",
      content: "import '../styles/globals.css'",
    });
  });

  it("leaves a well-formed object input alone (returns canonical JSON)", () => {
    const repaired = unwrapDoubleEncodedInput('{"path":"a.txt"}');
    expect(repaired).not.toBeNull();
    expect(JSON.parse(repaired!)).toEqual({ path: "a.txt" });
  });

  it("refuses non-JSON, arrays, scalars, and unparseable nesting", () => {
    expect(unwrapDoubleEncodedInput("not json at all")).toBeNull();
    expect(unwrapDoubleEncodedInput("[1,2,3]")).toBeNull();
    expect(unwrapDoubleEncodedInput("42")).toBeNull();
    expect(unwrapDoubleEncodedInput('"just a plain string"')).toBeNull();
    expect(unwrapDoubleEncodedInput("null")).toBeNull();
  });

  it("recovers up to triple-encoding, refuses beyond", () => {
    const triple = JSON.stringify(JSON.stringify(JSON.stringify({ a: 1 })));
    expect(unwrapDoubleEncodedInput(triple)).toBe('{"a":1}');
    const quadruple = JSON.stringify(triple);
    expect(unwrapDoubleEncodedInput(quadruple)).toBeNull();
  });
});
