import type { TModel } from "../model.ts";
import type { actions } from "../actions.ts";

type TActions = ReturnType<typeof actions>;

async function settle(model: TModel, operations: TActions) {
  for (const d of [0, 1]) {
    model.state.token = `${"AB"[d]}s(close)`;
    if (model.dirty[d]) await operations.doPush(d, false);
    await model.survive();
  }

  let conflicts = 0;

  for (const d of [0, 1]) {
    model.state.token = `${"AB"[d]}l(close)`;
    const result = await operations.doPull(d, undefined);
    await model.survive();
    conflicts += (result?.conflicts ?? 1) + (await model.conflictCount(d));
  }

  return conflicts;
}

export async function closeTrace(model: TModel, operations: TActions) {
  await operations.restoreCheckouts();
  model.state.step = 99;
  let conflicts = await settle(model, operations);

  for (const choice of ["keep-mine", "take-server", "take-server"] as const) {
    if (!conflicts) break;

    for (const d of [0, 1]) {
      await operations.doResolve(d, model.pending[d]!.size ? choice : "take-server");
      await model.survive();
    }

    conflicts = await settle(model, operations);
  }

  if (conflicts) model.bad("I6-BLOCKED", `still ${conflicts} conflicts after resolve rounds`);
  else await checkConvergence(model);
}

async function checkConvergence(model: TModel) {
  const all = [...(await model.activePlaces(0)), ...(await model.activePlaces(1))];

  if (all.some((v) => v !== model.commits.at(-1)))
    model.bad("I2-final", "Conflict-free devices differ from server");
}
