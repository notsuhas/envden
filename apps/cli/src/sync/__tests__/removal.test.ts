import { expect, test } from "bun:test";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { createSharedFixture } from "./shared-fixture.ts";
import { layouts } from "./matrix-cases.ts";
import { approveLayout, approveThird } from "./round-fixture.ts";
import { removeFile } from "../remove.ts";
import { pull, push } from "../engine.ts";
import { readBytes, basePath } from "../local/files.ts";

const fixture = createSharedFixture();

for (const modes of layouts) {
  test(`explicit rm publishes deletion across devices: ${modes.join("+")}`, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, modes);
    const store = targets[0]!.store;

    const observer = await approveThird(f);
    expect(await Bun.file(observer).text()).toBe("TOKEN=local-test-value\n");

    const result = await removeFile(f.second, join(targets[0]!.root, ".env"), {
      yes: true,
      now: f.now,
    });

    expect(result.publish).toBe("next-push");
    expect(await readBytes(store)).toBeUndefined();

    for (const target of targets)
      expect(await Bun.file(join(target.root, target.path)).exists()).toBe(false);

    expect(await Promise.all(result.preserved.map((path) => Bun.file(path).text()))).toContain(
      "TOKEN=local-test-value\n",
    );

    expect(await Bun.file(f.aStore).text()).toBe("TOKEN=local-test-value\n");
    expect((await push(f.second, f.opts)).conflicts).toBe(0);
    await pull(f.first, f.opts);
    expect(await readBytes(f.aStore)).toBeUndefined();
    await pull(f.third, f.opts);
    expect(await Bun.file(observer).exists()).toBe(false);
    expect((await push(f.second, f.opts)).changed).toBe(0);
  });

  test(`absence never publishes deletion: ${modes.join("+")}`, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, modes);
    const store = targets[0]!.store;

    for (const mask of [1, 2, 3, 4, 5, 6, 7]) {
      await removePlaces(f.second.home, targets, mask);

      expect((await push(f.second, f.opts)).conflicts).toBe(0);
      expect(await Bun.file(store).text()).toBe("TOKEN=local-test-value\n");

      for (const target of targets)
        expect(await Bun.file(join(target.root, target.path)).text()).toBe(
          "TOKEN=local-test-value\n",
        );

      await pull(f.first, f.opts);
      expect(await Bun.file(f.aStore).text()).toBe("TOKEN=local-test-value\n");
    }
  });
}

test("rm refuses non-interactive removal without explicit confirmation", async () => {
  const f = await fixture();

  await Promise.resolve(
    expect(
      removeFile(f.first, join(f.checkout.root, ".env"), { now: f.now }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" }),
  );

  expect(await Bun.file(f.aStore).text()).toBe("TOKEN=local-test-value\n");
});

async function removePlaces(
  home: string,
  targets: Awaited<ReturnType<typeof approveLayout>>,
  mask: number,
) {
  const store = targets[0]!.store;
  if (mask & 1) await rm(store, { force: true });

  if (mask & 2)
    for (const target of targets) await rm(join(target.root, target.path), { force: true });

  if (mask & 4)
    for (const target of targets)
      await rm(basePath(home, store, target.mode === "copy" ? target.root : undefined), {
        force: true,
      });
}

test("confirmed rm discards an existing conflict without recreating it on push", async () => {
  const { atomicWrite } = await import("../../state/store/files.ts");
  const { loadState } = await import("../../state/store/repository.ts");
  const f = await fixture();
  await pull(f.second, f.opts);
  const store = (await loadState(f.second.home))!.links[0]!.store;
  await atomicWrite(store, "TOKEN=mine\n");
  await atomicWrite(f.aStore, "TOKEN=remote\n");
  await push(f.first, f.opts);
  expect((await pull(f.second, f.opts)).conflicts).toBe(1);

  const removed = await removeFile(f.second, join(f.checkoutB.root, ".env"), {
    yes: true,
    now: f.now,
  });

  const saved = await Promise.all(removed.preserved.map((path) => Bun.file(path).text()));
  expect(saved).toContain("TOKEN=mine\n");
  expect(saved).toContain("TOKEN=remote\n");
  expect((await push(f.second, f.opts)).conflicts).toBe(0);
  await pull(f.first, f.opts);
  expect(await readBytes(f.aStore)).toBeUndefined();
});
