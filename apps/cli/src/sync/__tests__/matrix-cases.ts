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
  if (count === 1) return [values[0], values[1], undefined].map((value) => [value]);
  const [base, x, y, missing] = values;

  const rows: (typeof values)[number][][] = [
    [base, base],
    [x, base],
    [base, x],
    [x, y],
    [base, missing],
    [missing, x],
  ];

  if (count === 3) rows.push([x, y, values[4]]);

  return rows.map((row, i) =>
    count === 3 && row.length === 2 ? [...row, values[i % values.length]] : row,
  );
}
