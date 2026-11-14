import { caughtError } from "./checks/errors.ts";
import { join } from "node:path";

import { loadState, saveState } from "../../../state/store/repository.ts";

import { removeFile } from "../../remove.ts";
import { resolveConflict } from "../../resolve.ts";

import { untrack } from "../../../links/checkout/untrack.ts";
import { linkFile } from "../../../links/file.ts";

import { read } from "./files.ts";
import type { TModel } from "./model.ts";

const DEL = "\0DEL";

export function localActions(model: TModel) {
  const {
    w,
    notes,
    trace,
    commits,
    dirty,
    pending,
    last,
    saved,
    bad,
    clean,
    places,
    absorb,
    state,
  } = model;

  const doRemove = async (d: number) => {
    const target = w.targets[d]![0]!;
    const before = await places(d);

    try {
      const reports: string[] = [];

      const result = await removeFile(w.devices[d]!, join(target.root, target.path), {
        yes: true,
        now: w.f.now,
        report: (m: string) => reports.push(m),
      });

      absorb(reports);
      for (const path of result.preserved) saved.add(path);

      trace.push(
        `${state.token} -> rm ${result.kind} publish=${result.publish} places=${JSON.stringify(await places(d))}`,
      );

      if (result.kind !== "removed") {
        return true;
      }

      model.intentSeen[d] = model.seen[d]!;
      dirty[d] = true;
      pending[d]!.add(DEL);
      last[d] = DEL;
      await model.observe(d);
      void before;

      return true;
    } catch (caught) {
      const error = caughtError(caught);
      const code = error.code;
      trace.push(`${state.token} -> rm threw ${code} ${error.message}`);
      if (code === "NOT_FOUND") return false;
      notes.push(`${state.step}:${state.token} rm threw ${code}: ${error.message}`);

      return true;
    }
  };

  const doResolve = async (d: number, choice: "keep-mine" | "take-server") => {
    try {
      const result = await resolveConflict(w.devices[d]!, { file: ".env", choice, now: w.f.now });
      for (const path of result.preserved) saved.add(path);
      absorb(result.placementReports);
      const now = await places(d);
      const value = now[0];
      trace.push(`${state.token} -> resolved places=${JSON.stringify(now)}`);

      model.intentSeen[d] = model.seen[d]!;
      acceptResolution(d, choice, value);
      await model.observe(d);

      return true;
    } catch (caught) {
      const error = caughtError(caught);
      const code = error.code;
      trace.push(`${state.token} -> resolve threw ${code} ${error.message}`);
      if (error.message === "Name exactly one conflict file") return false;
      notes.push(`${state.step}:${state.token} resolve threw ${code}: ${error.message}`);

      return true;
    }
  };

  function acceptResolution(
    d: number,
    choice: "keep-mine" | "take-server",
    value: string | undefined,
  ) {
    if (value === undefined) {
      if (!pending[d]!.has(DEL) && !state.tombstoned)
        bad("I5-resolve-deletion", `resolve ${choice} produced deletion without rm or tombstone`);

      model.intentSeen[d] = model.seen[d]!;
      dirty[d] = true;
      pending[d]!.add(DEL);
      last[d] = DEL;
    } else if (choice === "take-server" && commits.includes(value)) {
      clean(d, value);
    } else {
      if (!pending[d]!.has(value))
        bad("resolve-unknown-content", `resolve ${choice} produced ${JSON.stringify(value)}`);

      if (value === commits.at(-1)) clean(d);
      else {
        model.intentSeen[d] = model.seen[d]!;
        dirty[d] = true;
        pending[d]!.add(value);
        last[d] = value;
      }
    }
  }

  const doRetrack = async (d: number) => {
    const adapters = w.devices[d]!;

    for (const target of w.targets[d]!) {
      const state = (await loadState(adapters.home))!;
      const checkout = state.approved.find((item) => item.root === target.root);
      if (!checkout || !(await adapters.repo.checkoutAt(target.root))) continue;
      const cancelled = await untrack(adapters, target.root);
      for (const path of cancelled) trace.push(`Cancelled removal: ${path}`);
      if (cancelled.length && last[d] === DEL) clean(d, model.agreed[d]);

      const next = (await loadState(adapters.home))!;
      next.approved.push(checkout);

      if ((await read(join(target.root, ".env"))) !== undefined)
        await linkFile(adapters, next, checkout, adapters.placement("copy", target.root), ".env");

      await adoptUnlinked(d, target.root, next);

      await saveState(adapters.home, next);
    }

    trace.push(`${state.token} -> retracked places=${JSON.stringify(await places(d))}`);
  };

  async function adoptUnlinked(
    d: number,
    root: string,
    next: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  ) {
    if (dirty[d]) return;
    if (next.links.some((link) => link.root === root)) return;
    const value = await read(join(root, ".env"));
    if (value === undefined) return;
    dirty[d] = true;
    pending[d]!.add(value);
    last[d] = value;
  }

  return { doRemove, doResolve, doRetrack };
}
