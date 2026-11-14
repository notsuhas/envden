import { fresh, isolatedTrace } from "./fixture.ts";
import { createModel } from "./model.ts";
import { actions } from "./actions.ts";
import { closeTrace } from "./checks/closing.ts";

export function run(layout: readonly ("copy" | "link")[], tokens: string[]) {
  return isolatedTrace(() => exploreTrace(layout, tokens));
}

async function exploreTrace(layout: readonly ("copy" | "link")[], tokens: string[]) {
  const model = createModel(await fresh(layout));
  const operations = actions(model);

  for (const token of tokens) {
    const expanded =
      token === "a" ? ["Al", "Ae", "As"] : token === "r" ? ["Al", "Ar", "As"] : [token];

    for (const raw of expanded) {
      await operations.apply(raw);
      await model.survive();
    }

    model.state.step++;
  }

  await closeTrace(model, operations);

  return { violations: model.violations, notes: model.notes, trace: model.trace };
}
