import { caughtError } from "./checks/errors.ts";
import { checkPull } from "./checks/pull.ts";
import { pull } from "../../engine.ts";

import type { TModel } from "./model.ts";

export function pullActions(model: TModel) {
  const { w, notes, trace, bad, places, conflictCount, absorb, state } = model;

  const doPull = async (d: number, fail: number | undefined, quiet = false) => {
    const adapters = w.devices[d]!;
    const original = adapters.repo.ensureIgnored.bind(adapters.repo);
    const reports: string[] = [];

    if (fail !== undefined) {
      const root = w.targets[d]![fail]!.root;

      adapters.repo.ensureIgnored = async (checkout, path) => {
        if (checkout.root === root) throw new Error("Placement failure");
        await original(checkout, path);
      };
    }

    let result: Awaited<ReturnType<typeof pull>> | undefined;

    try {
      result = await pull(adapters, { ...w.f.opts, report: (m: string) => reports.push(m) });
    } catch (caught) {
      const error = caughtError(caught);
      const code = error.code;
      notes.push(`${state.step}:${state.token} pull threw ${code}: ${error.message}`);
      trace.push(`${state.token} -> threw ${code} ${error.message}`);
      result = undefined;
    } finally {
      adapters.repo.ensureIgnored = original;
    }

    absorb(reports);
    await model.observe(d);
    if (result) model.seen[d] = model.commits.length - 1;
    const records = await conflictCount(d);
    const now = await places(d);

    trace.push(
      `${state.token} -> pull ${JSON.stringify(result && { c: result.changed, x: result.conflicts })} rec=${records} places=${JSON.stringify(now)} reports=${JSON.stringify(reports)}`,
    );

    if (quiet || !result) return result;

    checkPull(model, d, result, records, now, await model.activePlaces(d));

    if (fail === undefined) await secondPull(d, now);

    return result;
  };

  async function secondPull(d: number, now: (string | undefined)[]) {
    const adapters = w.devices[d]!;

    const again: string[] = [];

    try {
      const second = await pull(adapters, { ...w.f.opts, report: (m: string) => again.push(m) });
      absorb(again);
      const after = await places(d);

      if (second.changed !== 0 || JSON.stringify(after) !== JSON.stringify(now))
        bad(
          "I4-second-pull",
          `changed ${second.changed} before ${JSON.stringify(now)} after ${JSON.stringify(after)} reports ${JSON.stringify(again)}`,
        );
    } catch (caught) {
      const error = caughtError(caught);
      const code = error.code;
      notes.push(`${state.step}:${state.token} second pull threw ${code}: ${error.message}`);
    }
  }

  return { doPull };
}
