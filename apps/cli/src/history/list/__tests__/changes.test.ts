import { expect, test } from "bun:test";
import { versionChanges, versionKind, type TKeyChanges } from "../changes.ts";

const bytes = (value: string) => new TextEncoder().encode(value);
const one = { content: bytes("A=1\nB=2\n") };
const two = { content: bytes("A=1\nB=3\nC=4\n") };
const three = { content: bytes("B=3\nC=4\n") };
const deleted = { content: undefined };
const broken = { content: bytes('A="unterminated\n') };

const cases: [string, { content: Uint8Array | undefined }[], boolean, TKeyChanges[]][] = [
  ["creation adds every key", [one], true, [{ added: ["A", "B"], changed: [], removed: [] }]],
  ["pruned predecessor is unknown", [one], false, ["unknown"]],
  [
    "edits compare with the next older version",
    [three, two, one],
    true,
    [
      { added: [], changed: [], removed: ["A"] },
      { added: ["C"], changed: ["B"], removed: [] },
      { added: ["A", "B"], changed: [], removed: [] },
    ],
  ],
  [
    "a deletion removes every key and a recreation adds them",
    [one, deleted, one],
    true,
    [
      { added: ["A", "B"], changed: [], removed: [] },
      { added: [], changed: [], removed: ["A", "B"] },
      { added: ["A", "B"], changed: [], removed: [] },
    ],
  ],
  ["unparsable content", [broken, one], false, ["unparsed", "unknown"]],
];

for (const [name, versions, complete, expected] of cases)
  test(`version changes: ${name}`, () => {
    expect(versionChanges(versions, complete)).toEqual(expected);
  });

for (const [state, kind] of [
  [1, "live"],
  [2, "deleted"],
  [3, "restored"],
  [4, "lost"],
] as const)
  test(`version kind ${state}`, () => {
    expect(versionKind(state)).toBe(kind);
  });
