import * as p from "@envden/core/protocol";
import { expect, test } from "bun:test";
import { matchingVersion } from "../match.ts";
import { walkVersions } from "../walk.ts";

const zero = new Uint8Array(32);
const file = new Uint8Array(32).fill(1);
const other = new Uint8Array(32).fill(2);

function header(seq: number, list: number): p.ISigned<p.IManifestHeader> {
  return {
    body: {
      vaultId: zero,
      seq: BigInt(seq),
      op: 1,
      prev: zero,
      listSeq: 0n,
      listHead: zero,
      epoch: 1,
      keyringHash: zero,
      filesHash: new Uint8Array(32).fill(list),
      envelopeHash: zero,
      createdAt: BigInt(seq),
      signer: zero,
    },
    signature: zero,
  };
}

function entry(fileId: Uint8Array, version: number, state = 1): p.IFileEntry {
  return { fileId, version: BigInt(version), epoch: 1, state, blobHash: zero, name: zero };
}

// Lists by number; a missing number is a pruned list.
async function walk(headerLists: number[], lists: Record<number, p.IFileEntry[]>) {
  const headers = headerLists.map((list, index) => header(index + 1, list));

  const walks = await walkVersions(headers, [file], async (hash) =>
    lists[hash[0]!] ? { entries: lists[hash[0]!]! } : undefined,
  );

  const result = walks.get(p.base32(file))!;

  return {
    versions: result.versions.map((item) => [
      Number(item.entry.version),
      item.header ? Number(item.header.body.seq) : null,
    ]),
    pruned: result.pruned,
  };
}

const cases: [
  string,
  number[],
  Record<number, p.IFileEntry[]>,
  { versions: (number | null)[][]; pruned: boolean },
][] = [
  [
    "each version keeps the oldest header listing it",
    [1, 1, 2, 2, 3],
    { 1: [], 2: [entry(file, 1), entry(other, 1)], 3: [entry(file, 2), entry(other, 1)] },
    {
      versions: [
        [2, 5],
        [1, 3],
      ],
      pruned: false,
    },
  ],
  [
    "other files' changes don't make versions",
    [1, 2, 3],
    {
      1: [entry(file, 1)],
      2: [entry(file, 1), entry(other, 1)],
      3: [entry(file, 1), entry(other, 2)],
    },
    { versions: [[1, 1]], pruned: false },
  ],
  [
    "a pruned list ends the walk and leaves the oldest header unknown",
    [1, 2, 3],
    { 2: [entry(file, 1)], 3: [entry(file, 2, 2)] },
    {
      versions: [
        [2, 3],
        [1, null],
      ],
      pruned: true,
    },
  ],
  [
    "a file absent from the head has no versions",
    [1],
    { 1: [entry(other, 1)] },
    { versions: [], pruned: false },
  ],
];

for (const [name, headerLists, lists, expected] of cases)
  test(`walk: ${name}`, async () => {
    expect(await walk(headerLists, lists)).toEqual(expected);
  });

test("matching version is the newest with the same bytes, tombstones match a missing file", () => {
  const a = new Uint8Array([1]);

  const versions = [
    { version: 4, content: a },
    { version: 3, content: undefined },
    { version: 2, content: a },
  ];

  expect(matchingVersion(versions, new Uint8Array([1]))).toBe(4);
  expect(matchingVersion(versions, undefined)).toBe(3);
  expect(matchingVersion(versions, new Uint8Array([2]))).toBeUndefined();
});
