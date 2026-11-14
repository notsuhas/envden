import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { serverBytes } from "./interleaving/fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { pull, push } from "../engine.ts";
import { removeFile } from "../remove.ts";
import type { TFetch } from "../../client/fetch.ts";

const fixture = createSharedFixture();
const initial = "TOKEN=local-test-value\n";
const edited = "TOKEN=edited\n";

async function loseResponse(f: Awaited<ReturnType<typeof fixture>>) {
  const fetcher: TFetch = async (input, init) => {
    const result = await f.fetcher(input, init);

    if (new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/swap")
      throw new Error("Lost response");

    return result;
  };

  await Promise.resolve(expect(push(f.second, { ...f.opts, fetcher })).rejects.toThrow());
}

test("acknowledgement leaves skipped copy ancestors unchanged", async () => {
  const f = await fixture();
  const targets = await approveLayout(f, ["copy", "copy"]);
  const original = f.second.repo.checkoutAt.bind(f.second.repo);

  f.second.repo.checkoutAt = async (root) =>
    root === targets[1]!.root ? undefined : original(root);

  await atomicWrite(join(targets[0]!.root, ".env"), edited);
  await loseResponse(f);
  f.second.repo.checkoutAt = original;
  await push(f.second, f.opts);
  expect(await serverBytes(f)).toBe(edited);
});

for (const unpushed of [false, true])
  test(`tracked detached revert is an edit; unpushed store ${unpushed}`, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, ["link"]);
    await atomicWrite(targets[0]!.store, edited);
    if (!unpushed) await push(f.second, f.opts);
    const path = join(targets[0]!.root, ".env");
    await rm(path);
    await atomicWrite(path, initial);
    const result = await push(f.second, f.opts);

    if (unpushed) expect(result.conflicts).toBe(1);
    else expect(await serverBytes(f)).toBe(initial);
  });

for (const command of [push, pull])
  test(`acknowledgement preserves a later removal on ${command.name}`, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, ["copy"]);
    await atomicWrite(join(targets[0]!.root, ".env"), edited);
    await loseResponse(f);
    await removeFile(f.second, join(targets[0]!.root, ".env"), { yes: true, now: f.now });
    await command(f.second, f.opts);
    await push(f.second, f.opts);
    expect(await serverBytes(f)).toBeUndefined();
  });

for (const mode of ["copy", "link"] as const)
  test(`pending resume preserves a written ${mode} reverted by the user`, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, [mode, "copy"]);
    await atomicWrite(f.aStore, edited);
    await push(f.first, f.opts);
    const original = f.second.repo.ensureIgnored.bind(f.second.repo);

    f.second.repo.ensureIgnored = async (checkout, path) => {
      if (checkout.root === targets[1]!.root) throw new Error("Placement failed");
      await original(checkout, path);
    };

    await pull(f.second, f.opts);
    f.second.repo.ensureIgnored = original;

    await atomicWrite(
      mode === "link" ? targets[0]!.store : join(targets[0]!.root, ".env"),
      initial,
    );

    await push(f.second, f.opts);
    expect(await serverBytes(f)).toBe(initial);
  });
