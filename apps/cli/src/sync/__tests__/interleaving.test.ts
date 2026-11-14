import { expect, test } from "bun:test";
import { createSharedFixture } from "./shared-fixture.ts";
import { sequences } from "./interleaving/model.ts";
import { interleavingFixture, read, serverBytes, verifySurvival } from "./interleaving/fixture.ts";
import { edit, receive, send, remove, resolve, retrack } from "./interleaving/actions.ts";
import { pull } from "../engine.ts";

const fixture = createSharedFixture();

for (const [index, sequence] of sequences().entries())
  test(`interleaving ${index}: ${sequence.join(",")}`, async () => {
    const run = await interleavingFixture(await fixture());

    for (const [step, code] of sequence.entries()) {
      const device = code % 2;

      const actions = [
        () => edit(run, device, `TOKEN=edit-${index}-${step}\n`),
        () => edit(run, device, "TOKEN=local-test-value\n"),
        () => receive(run, device),
        () => send(run, device),
        () => send(run, device, true),
        () => receive(run, device, true),
        () => remove(run, device),
        () => resolve(run, device, "keep-mine"),
        () => resolve(run, device, "take-server"),
        () => retrack(run, device),
      ];

      await actions[Math.floor(code / 2)]!();
      await verifySurvival(run);
    }

    for (const device of [0, 1]) await send(run, device);
    const results = await Promise.all(run.devices.map((adapters) => pull(adapters, run.opts)));
    if (results.some((result) => result.conflicts)) return;
    const server = await serverBytes(run.f);
    for (const path of [...run.stores, ...run.paths]) expect(await read(path)).toBe(server);
  });
