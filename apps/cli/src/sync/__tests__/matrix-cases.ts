export const values = [
  "TOKEN=local-test-value\nOTHER=base\n",
  "TOKEN=X\nOTHER=base\n",
  "TOKEN=Y\nOTHER=base\n",
  undefined,
  "TOKEN=Z\nOTHER=base\n",
] as const;

export const remotes = [
  "unchanged",
  "changed",
  "deleted",
  "applied",
  "unpublished",
  "merge",
] as const;

export const layouts = [
  ["link"],
  ["copy"],
  ["link", "copy"],
  ["copy", "copy"],
  ["link", "link"],
  ["link", "copy", "copy"],
] as const;

export function caseValue(path: string, value: string | undefined) {
  return value?.replace("TOKEN=", `TOKEN=${path}:`);
}

export function representativeRows(count: number) {
  const states = values.slice(0, 4);
  const uniform = states.map((value) => Array.from({ length: count }, () => value));
  if (count === 1) return uniform;

  const rotated = states.map((_, start) =>
    Array.from({ length: count }, (_, place) => states[(start + place) % states.length]),
  );

  return [uniform[0]!, uniform[3]!, ...rotated];
}
