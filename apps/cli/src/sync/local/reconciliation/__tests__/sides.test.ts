import { z } from "zod";
import { expect, test } from "bun:test";
import { deriveFileSides } from "../content/sides.ts";
import rows from "./sides/copy.json";

const content = z.enum(["A", "B", "C"]).nullable();
const serverState = z.enum(["absent", "tombstone", "A", "B", "C"]);

const rowSchema = z.tuple([
  content,
  content,
  content,
  serverState,
  content,
  content,
  z.boolean(),
  content,
  serverState,
]);

const bytes = (value: string | null) =>
  value === null ? undefined : new TextEncoder().encode(value);

function remote(value: string) {
  if (value === "absent") return { kind: "absent" } as const;
  if (value === "tombstone") return { kind: "tombstone" } as const;

  return { kind: "live", bytes: bytes(value)! } as const;
}

test("literal conflict sides cover every store, base, server, copy and removal combination", () => {
  const cases = new Set<string>();

  for (const row of rows) {
    const [store, recorded, previous, server, copy, base, pending, mine, theirs] =
      rowSchema.parse(row);

    cases.add(JSON.stringify(row.slice(0, 7)));

    const result = deriveFileSides({
      storeBeforeRestore: bytes(store),
      recorded: bytes(recorded),
      previous: bytes(previous),
      server: remote(server),
      pendingRemoval: pending,
      copies: [
        { bytes: bytes(copy), base: bytes(base), tracked: true, mode: "copy", detached: false },
      ],
    });

    expect({ mine: result.mine, theirs: result.theirs }).toEqual({
      mine: bytes(mine),
      theirs: remote(theirs),
    });
  }

  expect(cases.size).toBe(10240);
});
