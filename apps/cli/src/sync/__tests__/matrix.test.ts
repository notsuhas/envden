import { expectedCase } from "./matrix-expectation.ts";
import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, readFile, lstat } from "node:fs/promises";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { syncFixture } from "./flows.ts";
import { matrixFixture, survivingContent, resetMatrix } from "./matrix-fixture.ts";
import { values, remotes, layouts, caseValue, representativeRows } from "./matrix-cases.ts";
import type { TMatrix } from "./matrix-fixture.ts";
import { readBytes } from "../local/files.ts";
import { pull, push } from "../engine.ts";
import { resolveConflict } from "../resolve.ts";
import { conflictRecords } from "../local/conflicts.ts";
import { loadState, saveState } from "../../state/store/repository.ts";

let shared: Awaited<ReturnType<typeof syncFixture>>;

beforeAll(async () => {
  shared = await syncFixture();
});

afterAll(async () => {
  await shared?.cleanup();
});

for (const modes of layouts)
  describe(`layout ${modes.join("+")}`, () => {
    for (const remote of remotes)
      describe(`file matrix ${modes.join("+")} ${remote}`, () => {
        let fixture: Awaited<ReturnType<typeof syncFixture>>;
        let preparation: ReturnType<typeof matrixFixture>;
        let f: TMatrix;
        const reports: string[] = [];
        const saved = new Map<string, string[]>();
        const outcomes = new Map<string, ReturnType<typeof expectedCase>>();

        beforeAll(async () => {
          fixture = shared;
          await resetMatrix(fixture, `${modes.join("-")}-${remote}`);
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

          for (const item of f.cases)
            outcomes.set(
              item.path,
              expectedCase(
                item.path,
                item.row,
                remote,
                item.links.map((target) => target.mode),
              ),
            );
        });

        test("pull preserves each case and settles all unconflicted targets", async () => {
          await pull(f.second, { ...f.opts, report: (message) => reports.push(message) });
          await verifyTargets(f, outcomes);

          for (const item of f.cases) {
            if (
              remote === "merge" &&
              item.row[0] === caseValue(item.path, values[1]) &&
              item.row
                .slice(1)
                .every(
                  (value) =>
                    value === caseValue(item.path, values[0]) ||
                    value === caseValue(item.path, values[1]),
                )
            )
              expect(new TextDecoder().decode(await readBytes(item.store))).toBe(
                caseValue(item.path, "TOKEN=X\nOTHER=R\n")!,
              );

            await verifySurvival(f, item, remote, reports, saved);
          }

          for (const record of await conflictRecords(f.second.home))
            for (const path of record.alternatives) expect(reports.join("\n")).toContain(path);
        });

        const count = representativeRows(1 + modes.filter((mode) => mode === "copy").length).length;

        for (let i = 0; i < count; i++)
          test(`resolve case ${i}`, async () => {
            const item = f.cases[i]!;

            const record = (await conflictRecords(f.second.home)).find(
              (record) => record.store === item.store,
            );

            const outcome = outcomes.get(item.path)!;
            expect(!!record).toBe(outcome.conflict);
            if (!outcome.conflict) return;
            expect(record).toBeDefined();
            expect(await readBytes(record!.mine)).toEqual(encode(outcome.mine));
            expect(await readBytes(record!.server)).toEqual(encode(outcome.theirs));
            const choice = (["keep-mine", "take-server", "edit"] as const)[i % 3]!;

            const expected = choice === "take-server" ? outcome.theirs : outcome.mine;

            const result = await resolveConflict(f.second, { file: item.path, choice, now: f.now });
            saved.set(item.path, result.preserved);
            await verifySurvival(f, item, remote, reports, saved);

            outcome.store = expected;
            outcome.targets = item.links.map(() => expected);
            outcome.conflict = false;
            expect(await readBytes(item.store)).toEqual(encode(expected));
            await verifyTargets(f, outcomes);
          });

        test("push and repeat pull preserve settled content", async () => {
          await push(f.second, { ...f.opts, report: (message) => reports.push(message) });
          await verifyTargets(f, outcomes);
          const repeated = await pull(f.second, f.opts);
          expect(repeated.conflicts).toBe(0);
          expect(repeated.changed).toBe(0);
          await verifyTargets(f, outcomes);
          for (const item of f.cases) await verifySurvival(f, item, remote, reports, saved);
        });

        test("observer receives every final file", async () => {
          await approveObserver(f);
          await pull(f.third, f.opts);

          for (const item of f.cases) {
            await verifySurvival(f, item, remote, reports, saved);
            const expected = encode(outcomes.get(item.path)!.store);
            const path = join(f.root, "third-checkout", item.path);

            if (expected === undefined)
              expect(await lstat(path).catch(() => undefined)).toBeUndefined();
            else expect(new Uint8Array(await readFile(path))).toEqual(new Uint8Array(expected));
          }
        });
      });
  });

function encode(value: string | undefined) {
  return value === undefined ? undefined : new TextEncoder().encode(value);
}

async function verifyTargets(f: TMatrix, outcomes: Map<string, ReturnType<typeof expectedCase>>) {
  const records = await conflictRecords(f.second.home);

  for (const item of f.cases) {
    const expected = outcomes.get(item.path)!;
    expect(records.some((record) => record.store === item.store)).toBe(expected.conflict);
    expect(await readBytes(item.store)).toEqual(encode(expected.store));

    for (const [index, target] of item.links.entries()) {
      const value = expected.targets[index];
      const path = join(target.root, target.path);

      if (value === undefined) expect(await Bun.file(path).exists()).toBe(false);
      else expect(await Bun.file(path).text()).toBe(value);
    }
  }
}

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

async function verifySurvival(
  f: TMatrix,
  item: TMatrix["cases"][number],
  remote: (typeof remotes)[number],
  reports: string[],
  saved: Map<string, string[]>,
) {
  const paths = saved.get(item.path) ?? [];

  const surviving = await survivingContent(f.second.home, item, reports, paths);

  const written = item.row.filter(
    (value) => value !== undefined && value !== caseValue(item.path, values[0]),
  );

  if (remote === "changed") written.push(caseValue(item.path, "TOKEN=R\n"));
  if (remote === "merge") written.push(caseValue(item.path, "TOKEN=local-test-value\nOTHER=R\n"));
  for (const value of written) expect(surviving).toContain(value);
}
