import { afterAll, expect, test } from "bun:test";
import { fresh, shutdown } from "../world.ts";
import { createModel } from "../../model.ts";
import { pullActions } from "../../pull.ts";

afterAll(shutdown);

test("injected placement failure still checks a conflict-free pull", async () => {
  const model = createModel(await fresh(["copy"]));
  model.w.targets[1]![0]!.root += "-fault";
  model.commits.push("TOKEN=expected\n");
  await pullActions(model).doPull(1, 0);
  expect(model.violations.map((violation) => violation.kind)).toContain("I2-pull-not-converged");
});
