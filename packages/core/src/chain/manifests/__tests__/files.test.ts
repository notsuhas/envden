import { expect, test } from "bun:test";
import { changedFiles } from "../files.ts";
import { bytes } from "../../__tests__/fixtures.ts";

const old = {
  fileId: bytes(1),
  version: 2n,
  epoch: 2,
  state: 1,
  blobHash: bytes(2),
  name: bytes(3),
};

const next = { ...old, version: 3n, epoch: 3, name: bytes(4) };

test("file transitions retain IDs, increase versions and bind changed names and epochs", () => {
  const before = { entries: [old] };
  expect(changedFiles(before, before, 2, 3)).toHaveLength(0);
  expect(changedFiles(before, { entries: [next] }, 2, 3, 1)).toEqual([next]);
  expect(() => changedFiles(before, { entries: [] }, 2, 3)).toThrow();

  for (const entry of [
    { ...next, version: 1n },
    { ...next, version: 2n },
    { ...next, epoch: 1 },
    { ...next, epoch: 4 },
    { ...next, name: old.name },
  ]) {
    expect(() => changedFiles(before, { entries: [entry] }, 2, 3)).toThrow();
  }

  expect(() => changedFiles(before, { entries: [{ ...next, epoch: 2 }] }, 2, 3, 1)).toThrow();
  expect(() => changedFiles({ entries: [] }, { entries: [{ ...next, epoch: 1 }] }, 2, 3)).toThrow();
  expect(() => changedFiles(before, { entries: [{ ...next, state: 3 }] }, 2, 3, 1)).toThrow();
});

test("repair-fix cannot add IDs or touch tombstones; recovered files must be current epoch", () => {
  const recovered = { ...next, state: 3 };
  expect(changedFiles({ entries: [old] }, { entries: [recovered] }, 2, 3, 11)).toEqual([recovered]);
  expect(() => changedFiles({ entries: [] }, { entries: [recovered] }, 2, 3, 11)).toThrow();

  for (const state of [2, 4]) {
    expect(() =>
      changedFiles(
        { entries: [{ ...old, state, blobHash: bytes(0) }] },
        { entries: [recovered] },
        2,
        3,
        11,
      ),
    ).toThrow();
  }

  expect(() =>
    changedFiles({ entries: [old] }, { entries: [{ ...recovered, epoch: 2 }] }, 2, 3, 11),
  ).toThrow();
});
