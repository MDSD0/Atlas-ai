import assert from "node:assert/strict";
import test from "node:test";
import { checkout } from "../src/cart.mjs";

test("checkout multiplies each line price by quantity", () => {
  assert.equal(
    checkout([
      { price: 3, quantity: 2 },
      { price: 7, quantity: 1 },
    ]).total,
    13,
  );
});
