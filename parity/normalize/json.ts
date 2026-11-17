export function orderJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderJson);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, orderJson(item)]),
  );
}
