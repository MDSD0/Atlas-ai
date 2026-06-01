import { calculateTotal } from "./cart";

export function checkout(): number {
  return calculateTotal([1, 2, 3]);
}
