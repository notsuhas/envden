import { expect, test } from "bun:test";
import { syncFixture } from "./flows.ts";
import { syncContext } from "../remote/context.ts";
import { recordConflict, conflictRecords } from "../local/conflicts.ts";
import { basePath, readBytes } from "../local/files.ts";

test("a deletion side is named and every extra local version is saved and reported", async () => {
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

    expect(reports.some((line) => line.startsWith("Mine: deleted;"))).toBe(true);
    const record = (await conflictRecords(f.first.home))[0]!;
    expect(record.mineDeleted).toBe(true);
    const path = record.alternatives.at(-1)!;
    expect(await readBytes(path)).toEqual(copy);
    expect(reports.some((line) => line.endsWith(path))).toBe(true);
  } finally {
    await f.cleanup();
  }
});
