export function calculateTotal(lines) {
  return lines.reduce((sum, line) => sum + line.price, 0);
}

export function checkout(lines) {
  return { total: calculateTotal(lines) };
}
