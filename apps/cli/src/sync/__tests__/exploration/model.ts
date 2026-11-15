import { lstat } from "node:fs/promises";
import { join } from "node:path";

const fixtureClock = () => 1800000000000;

import { serverBytes } from "./observation/server.ts";

import { atomicWrite } from "../../../state/store/files.ts";

import { conflictRecords } from "../../local/conflicts.ts";

import { INIT, type TWorld } from "./fixtures/world.ts";
import { read, walk } from "./files.ts";

interface IViolation {
  kind: string;
  step: number;
  token: string;
  detail: string;
}

export function createModel(w: TWorld) {
  const violations: IViolation[] = [];
  const notes: string[] = [];
  const trace: string[] = [];
  const commits: (string | undefined)[] = [INIT];
  const seen = [0, 0];
  const intentSeen = [0, 0];
  const authors = [-1];
  const skipped = new Set<string>();
  const untracked = new Set<string>();

  const observed: (string | undefined)[][] = w.targets.map((targets) =>
    Array.from({ length: targets.length + 1 }, () => INIT),
  );

  const deferred = new Map<string, { d: number; value: string }>();

  const corrupt = new Set<number>();

  const dirty = [false, false];
  const pending = [new Set<string>(), new Set<string>()];
  const last: (string | undefined)[] = [undefined, undefined];
  const required = new Set<string>();
  const saved = new Set<string>();
  const state = { unique: 0, step: 0, token: "", tombstoned: false };

  const bad = (kind: string, detail: string) =>
    violations.push({ kind, step: state.step, token: state.token, detail });

  const agreed: (string | undefined)[] = [INIT, INIT];

  const clean = (d: number, value: string | undefined = commits.at(-1)) => {
    if (corrupt.has(d)) return;
    agreed[d] = value;
    seen[d] = commits.lastIndexOf(value);
    dirty[d] = false;
    pending[d]!.clear();
    last[d] = undefined;
  };

  const placePath = async (d: number, t: number) => {
    const target = w.targets[d]![t]!;

    const path = join(target.root, target.path);
    const linked = (await lstat(path).catch(() => undefined))?.isSymbolicLink();

    return linked ? target.store : path;
  };

  const places = async (d: number) =>
    Promise.all([
      read(w.stores[d]!),
      ...w.targets[d]!.map((target) => read(join(target.root, target.path))),
    ]);

  const activePlaces = async (d: number) =>
    Promise.all([
      read(w.stores[d]!),
      ...w.targets[d]!.filter(
        (target) => !skipped.has(target.root) && !untracked.has(target.root),
      ).map((target) => read(join(target.root, target.path))),
    ]);

  const conflictCount = async (d: number) =>
    (await conflictRecords(w.devices[d]!.home)).filter((r) => r.store === w.stores[d]).length;

  const absorb = (reports: string[]) => {
    for (const report of reports) {
      const match =
        /^Saved .*: (.+)$/.exec(report) ?? /^Kept your previous .* at (.+)$/.exec(report);

      if (match) saved.add(match[1]!);
    }
  };

  const reachable = async () => {
    const strict = new Set<string | undefined>([...(await places(0)), ...(await places(1))]);
    for (const path of saved) strict.add(await read(path));
    // Pushed versions stay in server history, so overwriting them needs no local backup.
    for (const value of commits) strict.add(value);

    for (const device of w.devices.slice(0, 2))
      for (const record of await conflictRecords(device!.home))
        for (const path of record.alternatives) strict.add(await read(path));

    return strict;
  };

  const survive = async () => {
    if (!required.size) return;
    const strict = await reachable();
    const missing = [...required].filter((v) => !strict.has(v));
    if (!missing.length) return;
    const anywhere = await backups();

    for (const value of missing) {
      bad(
        anywhere.has(value) ? "I3-unreported-backup" : "I3-LOST",
        `edit ${JSON.stringify(value)} not in any place or printed path`,
      );

      required.delete(value);
    }
  };

  async function backups() {
    const anywhere = new Set<string | undefined>();

    for (const d of [0, 1]) {
      const files: string[] = [];
      await walk(join(w.devices[d]!.home, "conflicts"), files);
      for (const file of files) anywhere.add(await read(file));
    }

    return anywhere;
  }

  const server = async () => serverBytes(w.observer, w.f.checkout.repoId);

  const write = async (d: number, t: number, value: string) => {
    const path = await placePath(d, t);
    const before = await read(path);
    if (before === value) return false;
    recordPlaceEdit(d, t, value, before);
    await atomicWrite(path, value, fixtureClock);
    await settleUnobserved(d, t);

    return true;
  };

  function recordPlaceEdit(d: number, t: number, value: string, before: string | undefined) {
    const root = w.targets[d]![t]!.root;

    if (skipped.has(root) || untracked.has(root)) {
      if (before !== undefined) required.delete(before);
      required.add(value);
      deferred.set(root, { d, value });
    } else recordEdit(d, value, before);
  }

  function recordEdit(d: number, value: string, before: string | undefined) {
    if (before !== undefined) required.delete(before);
    required.add(value);
    intentSeen[d] = seen[d]!;
    dirty[d] = true;
    pending[d]!.add(value);
    last[d] = value;
  }

  async function settleUnobserved(d: number, t: number) {
    const index = (await placePath(d, t)) === w.stores[d] ? 0 : t + 1;

    if (
      observed[d]![index] === agreed[d] &&
      (await places(d)).every((bytes) => bytes === agreed[d])
    )
      clean(d, agreed[d]);
  }

  async function observe(d: number) {
    const current = await places(d);
    observed[d]![0] = current[0];

    for (const [index, target] of w.targets[d]!.entries())
      if (!skipped.has(target.root) && !untracked.has(target.root))
        observed[d]![index + 1] = current[index + 1];
  }

  return {
    w,
    violations,
    notes,
    trace,
    commits,
    authors,
    seen,
    intentSeen,
    dirty,
    corrupt,
    pending,
    last,
    required,
    saved,
    bad,
    agreed,
    clean,
    placePath,
    places,
    activePlaces,
    skipped,
    untracked,
    conflictCount,
    absorb,
    survive,
    server,
    write,
    recordPlaceEdit,
    observe,
    settleUnobserved,
    async resumeSkipped() {
      for (const [root, { d, value }] of deferred) {
        if (skipped.has(root) || untracked.has(root)) continue;
        recordEdit(d, value, undefined);
        deferred.delete(root);
      }
    },
    state,
  };
}

export type TModel = ReturnType<typeof createModel>;
