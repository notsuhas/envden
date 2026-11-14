import { content, examples, allLocalRules, restoredRule } from "./file-rules.ts";
import { expect, test } from "bun:test";
import { deriveFileContent, deriveFileDecision } from "../file-decision.ts";

test("local trust rules assert content and both conflict sides", () => {
  for (const row of examples) {
    const copy = {
      bytes: content[row.bytes],
      base: content[row.base],
      tracked: row.tracked,
      mode: row.mode,
      detached: false,
    };

    const result = deriveFileContent(content[row.store], [copy]);

    expect(result).toEqual(
      "theirs" in row
        ? { kind: "conflict", mine: content[row.mine], theirs: content[row.theirs] }
        : { kind: "content", bytes: content[row.mine] },
    );
  }
});

test("remote rule cross product asserts full action and local result (2097152 cases)", () => {
  let count = 0;

  for (const row of allLocalRules())
    for (const server of content)
      for (const previous of content)
        for (let flags = 0; flags < 512; flags++) {
          verifyRemote(row, server, previous, flags);
          count++;
        }

  expect(count).toBe(2097152);
});

function verifyRemote(
  row: ReturnType<typeof allLocalRules>[number],
  server: (typeof content)[number],
  previous: (typeof content)[number],
  flags: number,
) {
  const tracked = !!(flags & 1);
  const published = !!(flags & 2);
  const choosing = !!(flags & 4);
  const repair = !!(flags & 8);
  const detached = !!(flags & 16);
  const tombstone = !!(flags & 32);
  const applied = !!(flags & 64);
  const historical = !!(flags & 128);
  const deleting = !!(flags & 256);
  const originalStore = content[row.store];

  row = restoredRule(row, server, published, deleting, tombstone);

  const local = expectedLocal(row, historical);

  const mine = local.kind === "conflict" ? local.mine : local.bytes;
  const remote = published ? server : mine;

  const action = expectedAction(
    local.kind === "conflict",
    detached,
    repair,
    tombstone,
    applied,
    previous,
    mine,
    remote,
    choosing,
    tracked || content[row.store] !== undefined,
  );

  const actual: unknown = deriveFileDecision({
    store: originalStore,
    deleting,
    copies: [
      {
        bytes: content[row.bytes],
        base: content[row.base],
        tracked: row.tracked,
        mode: row.mode,
        detached: false,
        historical,
      },
    ],
    tracked,
    published,
    server,
    previous,
    choosing,
    repair,
    detached,
    tombstone,
    applied,
  });

  expect(actual).toEqual({ local, mine, action });
}

function expectedAction(
  conflict: boolean,
  detached: boolean,
  repair: boolean,
  tombstone: boolean,
  applied: boolean,
  previous: Uint8Array | undefined,
  mine: Uint8Array | undefined,
  remote: Uint8Array | undefined,
  choosing: boolean,
  tracked: boolean,
) {
  const diverged = mine !== remote && mine !== previous && remote !== previous;

  const rules = [
    [conflict, { kind: "conflict" }],
    [detached, { kind: "detached" }],
    [repair && mine !== undefined, { kind: "repair-conflict" }],
    [deletionChoice(tombstone, applied, previous, mine), { kind: "choose" }],
    [choosing && mine !== undefined && mine !== remote, { kind: "choose" }],
    [(tracked || mine !== undefined) && diverged, { kind: "choose" }],
    [
      true,
      {
        kind: "write",
        next: defaultContent(remote, previous, tracked, mine),
      },
    ],
  ] as const;

  return rules.find(([matches]) => matches)![1];
}

function deletionChoice(
  tombstone: boolean,
  applied: boolean,
  previous: Uint8Array | undefined,
  mine: Uint8Array | undefined,
) {
  return tombstone && !applied && previous === undefined && mine !== undefined;
}

function defaultContent(
  remote: Uint8Array | undefined,
  previous: Uint8Array | undefined,
  tracked: boolean,
  mine: Uint8Array | undefined,
) {
  return remote === previous && (tracked || mine !== undefined) ? mine : remote;
}

function expectedLocal(row: ReturnType<typeof allLocalRules>[number], historical: boolean) {
  if (historical || row.bytes === 0) return { kind: "content", bytes: content[row.store] };

  if (row.theirs !== undefined)
    return { kind: "conflict", mine: content[row.mine], theirs: content[row.theirs] };

  return { kind: "content", bytes: content[row.mine] };
}
