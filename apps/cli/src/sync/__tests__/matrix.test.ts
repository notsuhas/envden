import type { TMatrix } from "./matrix-fixture.ts";
import { syncFixture } from "./flows.ts";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  matrixFixture,
  survivingContent,
  values,
  remotes,
  layouts,
  combinations,
} from "./matrix-fixture.ts";
import { readBytes } from "../local/files.ts";
import { pull, push } from "../engine.ts";
import { resolveConflict } from "../resolve.ts";
import { conflictRecords } from "../local/conflicts.ts";
import { loadState, saveState } from "../../state/store/repository.ts";

for (const modes of layouts)
  for (const remote of remotes)
    for (const choice of ["keep-mine", "take-server"] as const)
      describe(`file matrix ${modes.join("+")} ${remote} ${choice}`, () => {
        let fixture: Awaited<ReturnType<typeof syncFixture>>;
        let f: TMatrix;
        let preparation: ReturnType<typeof matrixFixture>;
        let before: (string | undefined)[][];
        const chosen = new Map<string, Uint8Array | undefined>();

        beforeAll(async () => {
          fixture = await syncFixture();
          preparation = matrixFixture(modes, remote, fixture);
        });

        beforeAll(async () => {
          await preparation.seedRemote();
        });

        beforeAll(async () => {
          await preparation.approveTargets();
        });

        beforeAll(async () => {
          await preparation.changeRemote();
        });

        beforeAll(async () => {
          f = await preparation.seedCases();
        });

        beforeAll(async () => {
          await pull(f.second, f.opts);
          await push(f.second, f.opts);
          before = await Promise.all(f.cases.map((item) => survivingContent(f.second.home, item)));
          expect((await pull(f.second, f.opts)).changed).toBe(0);

          expect(
            await Promise.all(f.cases.map((item) => survivingContent(f.second.home, item))),
          ).toEqual(before);
        });

        beforeAll(async () => {
          await approveObserver(f);
        });

        afterAll(async () => {
          await fixture?.cleanup();
        });

        const count = combinations(1 + modes.filter((mode) => mode === "copy").length).length;

        for (let start = 0; start < count; start += 4)
          test(`states ${start} through ${Math.min(start + 4, count) - 1}`, async () => {
            const cases = f.cases.slice(start, start + 4);
            const records = await conflictRecords(f.second.home);

            for (const [i, item] of cases.entries())
              await resolveCase(f, item, before[start + i]!, records, chosen, remote, choice);

            const remaining = await conflictRecords(f.second.home);

            for (const item of cases)
              expect(remaining.some((record) => record.store === item.store)).toBe(false);

            for (const item of cases)
              if (chosen.has(item.path))
                expect(await readBytes(item.store)).toEqual(chosen.get(item.path));
          });

        test("all choices push and pull without conflicts", async () => {
          await push(f.second, f.opts);
          expect((await pull(f.second, f.opts)).conflicts).toBe(0);
        });

        test("resolved choices do not change on pull", async () => {
          expect((await pull(f.second, f.opts)).changed).toBe(0);
        });

        test("observer receives chosen files", async () => {
          await pull(f.third, f.opts);

          for (const item of f.cases)
            await verifyChosen(item, chosen, join(f.root, "third-checkout"));
        });
      });

async function approveObserver(f: TMatrix) {
  const third = (await loadState(f.third.home))!;
  const root = join(f.root, "third-checkout");
  third.approved = [{ ...f.checkoutB, root, gitDir: join(root, ".git") }];
  await mkdir(root, { recursive: true });

  f.third.repo = createFakeRepoAdapter({
    checkoutAt: async () => third.approved[0],
    caseInsensitive: async () => false,
    ensureIgnored: async () => {},
  });

  await saveState(f.third.home, third);
}

async function resolveCase(
  f: TMatrix,
  item: (typeof f.cases)[number],
  before: (string | undefined)[],
  records: Awaited<ReturnType<typeof conflictRecords>>,
  chosen: Map<string, Uint8Array | undefined>,
  remote: (typeof remotes)[number],
  choice: "keep-mine" | "take-server",
) {
  const edited: (string | undefined)[] = item.row.filter(
    (value) => value !== undefined && value !== values[0],
  );

  if (remote === "changed") edited.push("TOKEN=R\n");
  for (const content of edited) expect(before).toContain(content);
  const matches = records.filter((record) => record.store === item.store);
  expect(matches.length).toBeLessThanOrEqual(1);

  if (!matches.length) {
    verifyUnconflicted(item, before[0], remote);

    return;
  }

  const record = matches[0]!;
  await verifyConflictServer(record, remote);

  chosen.set(
    item.path,
    choice === "keep-mine"
      ? record.mineDeleted
        ? undefined
        : await readBytes(record.mine)
      : record.deleted
        ? undefined
        : await readBytes(record.server),
  );

  await resolveConflict(f.second, {
    file: item.path,
    repo: item.links.at(-1)!.root,
    choice,
    now: f.now,
  });
}

async function verifyChosen(
  item: TMatrix["cases"][number],
  chosen: Map<string, Uint8Array | undefined>,
  root: string,
) {
  if (!chosen.has(item.path)) return;
  const content = chosen.get(item.path);
  expect(await readBytes(item.store)).toEqual(content);
  expect(await Bun.file(join(root, item.path)).exists()).toBe(content !== undefined);

  if (content !== undefined)
    expect(new Uint8Array(await Bun.file(join(root, item.path)).arrayBuffer())).toEqual(
      new Uint8Array(content),
    );
}

function verifyUnconflicted(
  item: TMatrix["cases"][number],
  stored: string | undefined,
  remote: (typeof remotes)[number],
) {
  const baseline = remote === "applied" ? undefined : values[0];
  const edits = [...new Set(item.row.filter((value) => value !== baseline))];
  expect(edits.length).toBeLessThanOrEqual(1);

  if (edits.length) expect(stored).toBe(edits[0]);
  else expect(stored).toBe(remoteContent(remote, baseline));
}

function remoteContent(remote: (typeof remotes)[number], baseline: string | undefined) {
  if (remote === "changed") return "TOKEN=R\n";
  if (remote === "deleted") return undefined;

  return baseline;
}

async function verifyConflictServer(
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  remote: (typeof remotes)[number],
) {
  if (!record.entry) return;

  const content = record.deleted
    ? undefined
    : new TextDecoder().decode(await readBytes(record.server));

  expect(content).toBe(remoteContent(remote, remote === "applied" ? undefined : values[0]));
}
