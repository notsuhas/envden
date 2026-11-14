export const content = [undefined, "base", "X", "Y"].map((value) =>
  value === undefined ? undefined : new TextEncoder().encode(value),
);

export const examples = [
  { store: 1, bytes: 2, base: 1, tracked: true, mode: "copy", mine: 2 },
  { store: 2, bytes: 1, base: 1, tracked: true, mode: "copy", mine: 2 },
  { store: 1, bytes: 0, base: 1, tracked: true, mode: "copy", mine: 1 },
  { store: 0, bytes: 0, base: 0, tracked: true, mode: "copy", mine: 0 },
  { store: 1, bytes: 2, base: 0, tracked: true, mode: "copy", mine: 2, theirs: 1 },
  { store: 1, bytes: 2, base: 1, tracked: false, mode: "copy", mine: 2, theirs: 1 },
  { store: 1, bytes: 2, base: 1, tracked: true, mode: "link", mine: 2, theirs: 1 },
  { store: 2, bytes: 3, base: 1, tracked: true, mode: "copy", mine: 2, theirs: 3 },
] as const;

export function allLocalRules() {
  const rows = [];

  for (let store = 0; store < 4; store++)
    for (let bytes = 0; bytes < 4; bytes++)
      for (let base = 0; base < 4; base++)
        for (const tracked of [false, true])
          for (const mode of ["copy", "link"] as const)
            rows.push(localRule(store, bytes, base, tracked, mode));

  return rows;
}

function localRule(
  store: number,
  bytes: number,
  base: number,
  tracked: boolean,
  mode: "copy" | "link",
  deleted = false,
): {
  store: number;
  bytes: number;
  base: number;
  tracked: boolean;
  mode: "copy" | "link";
  mine: number;
  theirs?: number;
} {
  const input = { store, bytes, base, tracked, mode };
  const trusted = mode === "copy" && tracked && base !== 0;

  const rules = [
    [bytes === 0 || bytes === store, { ...input, mine: store }],
    [!trusted, { ...input, mine: bytes, theirs: store }],
    [bytes === base && deleted, { ...input, mine: store }],
    [store === 0, { ...input, mine: store, theirs: bytes }],
    [bytes === base, { ...input, mine: store }],
    [store === base, { ...input, mine: bytes }],
    [true, { ...input, mine: store, theirs: bytes }],
  ] as const;

  return rules.find(([applies]) => applies)![1];
}

export function restoredRule(
  row: ReturnType<typeof allLocalRules>[number],
  server: (typeof content)[number],
  published: boolean,
  deleting: boolean,
  tombstone: boolean,
) {
  const store = row.store === 0 && published && !deleting ? content.indexOf(server) : row.store;

  return localRule(
    store,
    row.bytes,
    row.base,
    row.tracked,
    row.mode,
    deleting || (published && tombstone),
  );
}
