import { expect, test } from "bun:test";
import { syncFixture } from "./flows.ts";
import { syncContext } from "../remote/context.ts";
import { recordConflict, conflictRecords } from "../local/conflicts.ts";
import { basePath, readBytes } from "../local/files.ts";

test("a deletion side is named and every extra local version is saved in one short report", async () => {
  const f = await syncFixture();
  const reports: string[] = [];

  try {
    const context = await syncContext(f.first, { ...f.opts, report: (line) => reports.push(line) });
    const target = context.state.links[0]!;
    const copy = new TextEncoder().encode("COPY");

    await recordConflict(
      context,
      {
        ...target,
        targets: [target],
        entry: null,
        base: basePath(f.first.home, target.store),
      },
      { mine: undefined, theirs: { kind: "live", bytes: new TextEncoder().encode("SERVER") } },
      [undefined, new TextEncoder().encode("SERVER"), copy],
    );

    const record = (await conflictRecords(f.first.home))[0]!;
    expect(record.mineDeleted).toBe(true);
    expect(await readBytes(record.alternatives.at(-1)!)).toEqual(copy);
    expect(reports).toEqual([expect.stringMatching(/^Conflict in .*\.env: deleted here and/)]);
  } finally {
    await f.cleanup();
  }
});
