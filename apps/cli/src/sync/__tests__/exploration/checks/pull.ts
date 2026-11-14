import type { TModel } from "../model.ts";
import type { pull } from "../../../engine.ts";

const DEL = "\0DEL";

export function checkPull(
  model: TModel,
  d: number,
  result: Awaited<ReturnType<typeof pull>>,
  records: number,
  now: (string | undefined)[],
  active: (string | undefined)[],
) {
  const { commits, dirty, bad, clean } = model;
  const head = commits.at(-1);

  if (result.conflicts || records) {
    if (!dirty[d]) bad("spurious-conflict", "Clean device entered conflict");

    return;
  }

  if (dirty[d]) checkLocal(model, d, now, active);
  else if (active.some((v) => v !== head))
    bad("I2-pull-not-converged", "Clean device differs from server");
  else clean(d);
}

function checkLocal(
  model: TModel,
  d: number,
  now: (string | undefined)[],
  active: (string | undefined)[],
) {
  const desired = model.last[d] === DEL ? undefined : model.last[d];

  if (!active.includes(desired))
    model.bad("I7-pull-undid-action", "Most recent explicit action disappeared without conflict");

  if (model.last[d] === DEL && active.some((value) => value !== undefined))
    model.bad("I7-pull-undid-removal", "Removal was undone without conflict");

  if (active.every((value) => value === model.commits.at(-1))) model.clean(d);
}
