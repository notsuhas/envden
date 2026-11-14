import { removeFile } from "../remove.ts";
import { expect } from "bun:test";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { syncFixture } from "./flows.ts";
import { pull, push } from "../engine.ts";
import { readBytes, writeBytes, basePath } from "../local/files.ts";
import { conflictRecords } from "../local/conflicts.ts";
import type { loadState } from "../../state/store/repository.ts";
import { saveState } from "../../state/store/repository.ts";
import { resolveConflict } from "../resolve.ts";

const bytes = (value: string) => new TextEncoder().encode(value);
const original = bytes("TOKEN=local-test-value\n");

type TFixture = Awaited<ReturnType<typeof syncFixture>>;

type TState = NonNullable<Awaited<ReturnType<typeof loadState>>>;

type TTarget = TState["links"][number];

export async function seedScenario(
  scenario: string,
  f: TFixture,
  state: TState,
  target: TTarget,
  path: string,
  edited: Uint8Array,
) {
  if (scenario === "untracked-applied") {
    state.links = [];
    await saveState(f.second.home, state);
    await writeBytes(target.store, edited);
    await writeBytes(path, original);
    expect((await pull(f.second, f.opts)).conflicts).toBe(0);
    expect(await readBytes(target.store)).toEqual(edited);
    expect(await readBytes(path)).toEqual(edited);

    return true;
  }

  if (scenario === "unapproved-deletion") {
    await removeFile(f.first, join(f.checkout.root, ".env"), { yes: true, now: f.now });
    await push(f.first, f.opts);
    await writeBytes(path, edited);
  } else if (scenario.startsWith("untracked")) {
    state.links = [];
    await saveState(f.second.home, state);
    await rm(path);
    await writeBytes(path, edited);
  } else if (scenario === "different-base") {
    await writeBytes(basePath(f.second.home, target.store, target.root), bytes("TOKEN=older\n"));
    await writeBytes(path, edited);
  } else if (scenario === "missing-base") {
    await rm(basePath(f.second.home, target.store, target.root));
    await writeBytes(path, edited);
  } else if (scenario === "missing-copy") {
    await rm(path);
    await push(f.second, f.opts);
    expect(await readBytes(target.store)).toEqual(original);
    expect(await readBytes(path)).toEqual(original);

    return true;
  } else if (scenario === "merge-retry") {
    await writeBytes(f.aStore, bytes("TOKEN=local-test-value\nB=remote\n"));
    await push(f.first, f.opts);
    await writeBytes(path, bytes("TOKEN=local-test-value\nA=local\n"));
  } else {
    if (scenario === "deletion-side") await removeFile(f.second, path, { yes: true, now: f.now });
    await writeBytes(path, edited);

    await writeBytes(
      target.store,
      scenario === "deletion-side" ? undefined : bytes("TOKEN=store-edit\n"),
    );
  }

  return false;
}

export async function finishScenario(
  scenario: string,
  f: TFixture,
  state: TState,
  target: TTarget,
  path: string,
  edited: Uint8Array,
) {
  const reports: string[] = [];

  await pull(f.second, {
    ...f.opts,
    interactive: false,
    yes: !scenario.endsWith("no-yes"),
    report: (message) => reports.push(message),
  });

  const record = (await conflictRecords(f.second.home))[0]!;
  expect(record).toBeDefined();

  if (scenario.startsWith("untracked") || scenario === "missing-base")
    expect(await readBytes(target.store)).toEqual(original);

  if (scenario === "local-sides") {
    expect([await readBytes(record.mine), await readBytes(record.server)]).toContainEqual(edited);

    expect(reports.join("\n")).toContain(path);
  }

  await prepareResolution(scenario, f, state, target);
  if (scenario === "prune-root" || scenario === "untrack-root") return;

  const result = await resolveConflict(f.second, {
    file: ".env",
    choice: scenario.startsWith("edit-") ? "edit" : "take-server",
    now: f.now,
  });

  expect(await conflictRecords(f.second.home)).toHaveLength(0);
  if (scenario.startsWith("unapproved")) expect(await readBytes(path)).toEqual(edited);
  if (scenario === "deletion-side") expect(await readBytes(target.store)).toBeUndefined();

  if (scenario === "edit-content")
    expect(await readBytes(target.store)).toEqual(bytes("TOKEN=edited-resolution\n"));

  if (scenario === "changed-after-conflict") await verifyLateBackups(result);
}

async function verifyLateBackups(result: Awaited<ReturnType<typeof resolveConflict>>) {
  const preserved = await Promise.all(result.preserved.map((path) => readBytes(path)));
  expect(preserved).toContainEqual(bytes("TOKEN=later-store\n"));

  const paths = result.placementReports.map((message) =>
    message.slice(message.lastIndexOf(": ") + 2),
  );

  expect(await Promise.all(paths.map((path) => readBytes(path)))).toContainEqual(
    bytes("TOKEN=later-copy\n"),
  );
}

async function prepareResolution(scenario: string, f: TFixture, state: TState, target: TTarget) {
  if (scenario === "deletion-side") {
    const record = (await conflictRecords(f.second.home))[0]!;
    await writeBytes(record.file, undefined);
  }

  if (scenario === "edit-content") {
    const record = (await conflictRecords(f.second.home))[0]!;
    await writeBytes(record.file, bytes("TOKEN=edited-resolution\n"));
  }

  if (scenario === "changed-after-conflict") {
    await writeBytes(target.store, bytes("TOKEN=later-store\n"));
    await writeBytes(join(target.root, target.path), bytes("TOKEN=later-copy\n"));
  }

  if (scenario === "prune-root") {
    await rm(target.root, { recursive: true });
    const { pruneMissingCheckouts } = await import("../../links/prune.ts");
    await pruneMissingCheckouts(f.second.home, state, () => {});
    expect(await conflictRecords(f.second.home)).toHaveLength(0);
  }

  if (scenario === "untrack-root") {
    const { untrack } = await import("../../links/checkout/untrack.ts");
    await untrack(f.second, target.root);
    expect(await conflictRecords(f.second.home)).toHaveLength(0);
  }

  if (scenario === "removed") await rm(target.root, { recursive: true });

  if (scenario.startsWith("unapproved")) {
    state.approved = [];
    state.links = [];
    await saveState(f.second.home, state);
  }

  if (scenario === "retry") {
    const placement = f.second.placement;

    f.second.placement = () => {
      throw new Error("injected placement failure");
    };

    await Promise.resolve(
      expect(
        resolveConflict(f.second, { file: ".env", choice: "take-server", now: f.now }),
      ).rejects.toThrow(),
    );

    f.second.placement = placement;
  }
}
