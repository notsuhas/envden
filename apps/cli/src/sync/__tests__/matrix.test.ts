import { expect, test } from "bun:test";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { layouts } from "./matrix-cases.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { pull, push } from "../engine.ts";

const fixtureClock = () => 1800000000000;

const fixture = createSharedFixture();
const A = "TOKEN=local-test-value\n";
const B = "TOKEN=new\n";
const C = "TOKEN=other\n";

for (const modes of layouts)
  for (const [name, store, remote, expected, conflicts] of [
    ["agreement", A, A, A, 0],
    ["local edit", B, A, B, 0],
    ["remote edit", A, B, B, 0],
    ["same edit", B, B, B, 0],
    ["divergence", B, C, B, 1],
  ] as const)
    test(`${modes.join("+")}: ${name}`, async () => {
      const f = await fixture();
      const targets = await approveLayout(f, modes);
      await atomicWrite(targets[0]!.store, store, fixtureClock);
      await atomicWrite(f.aStore, remote, fixtureClock);
      await push(f.first, f.opts);
      const result = await pull(f.second, f.opts);
      expect(result.conflicts).toBe(conflicts);
      expect(await Bun.file(targets[0]!.store).text()).toBe(expected);

      if (!conflicts) {
        for (const target of targets)
          expect(await Bun.file(join(target.root, target.path)).text()).toBe(expected);

        expect((await pull(f.second, f.opts)).changed).toBe(0);
      }
    });

for (const [name, store, copied, remote, expected, conflicts] of [
  ["copy edit", A, B, A, B, 0],
  ["copy unchanged", B, A, A, B, 0],
  ["copy remote advance", A, A, B, B, 0],
  ["copy divergent edits", B, C, A, B, 1],
  ["copy and remote diverge", A, B, C, A, 1],
] as const)
  test(name, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, ["copy", "copy", "link"]);
    await atomicWrite(targets[0]!.store, store, fixtureClock);
    await atomicWrite(join(targets[0]!.root, ".env"), copied, fixtureClock);
    await atomicWrite(f.aStore, remote, fixtureClock);
    await push(f.first, f.opts);
    expect((await pull(f.second, f.opts)).conflicts).toBe(conflicts);
    expect(await Bun.file(targets[0]!.store).text()).toBe(expected);
  });
