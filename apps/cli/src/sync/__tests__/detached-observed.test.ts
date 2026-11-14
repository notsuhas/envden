import { afterAll, expect, test } from "bun:test";
import { fresh, shutdown } from "./exploration/fixtures/world.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { pull } from "../engine.ts";

afterAll(shutdown);

test("a detached save after an observed link edit is the newest edit", async () => {
  const w = await fresh(["link"]);
  const target = w.targets[1]![0]!;
  await atomicWrite(target.store, "TOKEN=edited\n");
  expect((await pull(w.devices[1], w.f.opts)).conflicts).toBe(0);
  const destination = join(target.root, target.path);
  await rm(destination);
  await atomicWrite(destination, "TOKEN=detached\n");
  expect((await pull(w.devices[1], w.f.opts)).conflicts).toBe(0);
  expect(await Bun.file(target.store).text()).toBe("TOKEN=detached\n");
});
