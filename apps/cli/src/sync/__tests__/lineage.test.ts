import { expect, test } from "bun:test";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { pull, push } from "../engine.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";
import type { TFetch } from "../../client/fetch.ts";

const fixture = createSharedFixture();

test("accepted attempt superseded by another device's revert is stale", async () => {
  const f = await fixture();
  await pull(f.second, f.opts);
  const store = (await loadState(f.second.home))!.links[0]!.store;
  await atomicWrite(store, "TOKEN=remote\n");

  const lost: TFetch = async (input, init) => {
    const response = await f.fetcher(input, init);

    if (new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/swap")
      throw new Error("Lost response");

    return response;
  };

  await Promise.resolve(expect(push(f.second, { ...f.opts, fetcher: lost })).rejects.toThrow());
  await pull(f.first, f.opts);
  await atomicWrite(f.aStore, "TOKEN=local-test-value\n");
  await push(f.first, f.opts);
  expect((await push(f.second, f.opts)).changed).toBe(0);
  expect(await Bun.file(store).text()).toBe("TOKEN=local-test-value\n");
});

for (const lostBase of [false, true])
  test(`partially placed server version superseded by a revert is stale; lost base ${lostBase}`, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, ["copy", "copy", "link"]);
    await atomicWrite(f.aStore, "TOKEN=remote\n");
    await push(f.first, f.opts);
    const original = f.second.repo.ensureIgnored.bind(f.second.repo);

    f.second.repo.ensureIgnored = async (checkout, path) => {
      if (checkout.root === targets[1]!.root) throw new Error("Placement failed");
      await original(checkout, path);
    };

    expect((await pull(f.second, f.opts)).conflicts).toBe(1);
    f.second.repo.ensureIgnored = original;

    if (lostBase) {
      const { rm } = await import("node:fs/promises");
      const { basePath } = await import("../local/files.ts");
      await rm(basePath(f.second.home, targets[0]!.store) + ".entry");
    }

    await atomicWrite(f.aStore, "TOKEN=local-test-value\n");
    await push(f.first, f.opts);
    expect((await push(f.second, f.opts)).changed).toBe(0);

    for (const target of targets)
      expect(await Bun.file(join(target.root, target.path)).text()).toBe(
        "TOKEN=local-test-value\n",
      );
  });

for (const mode of ["copy", "link"] as const)
  test(`restoring bytes cancels pending removal in ${mode} mode`, async () => {
    const { removeFile } = await import("../remove.ts");
    const { rm } = await import("node:fs/promises");
    const f = await fixture();
    const targets = await approveLayout(f, [mode]);
    const path = join(targets[0]!.root, ".env");
    await removeFile(f.second, path, { yes: true, now: f.now });
    await rm(path, { force: true });
    await atomicWrite(path, "TOKEN=local-test-value\n");
    const reports: string[] = [];

    expect(
      (await push(f.second, { ...f.opts, report: (message) => reports.push(message) })).conflicts,
    ).toBe(0);

    expect(reports.some((message) => message.includes("Cancelled removal"))).toBe(true);
    await pull(f.first, f.opts);
    expect(await Bun.file(f.aStore).text()).toBe("TOKEN=local-test-value\n");
  });

test("live resolution clears deletion intent before a later missing store", async () => {
  const { removeFile } = await import("../remove.ts");
  const { resolveConflict } = await import("../resolve.ts");
  const { rm } = await import("node:fs/promises");
  const f = await fixture();
  await pull(f.second, f.opts);
  const store = (await loadState(f.second.home))!.links[0]!.store;
  await removeFile(f.second, join(f.checkoutB.root, ".env"), { yes: true, now: f.now });
  await atomicWrite(f.aStore, "TOKEN=remote\n");
  await push(f.first, f.opts);
  expect((await push(f.second, f.opts)).conflicts).toBe(1);
  await resolveConflict(f.second, { file: ".env", choice: "take-server", now: f.now });
  await rm(store);
  expect((await push(f.second, f.opts)).changed).toBe(0);
  await pull(f.first, f.opts);
  expect(await Bun.file(f.aStore).text()).toBe("TOKEN=remote\n");
});

test("an excluded local edit is held back even when the server is unchanged", async () => {
  const { setConfig } = await import("../../settings/config.ts");
  const f = await fixture();
  await pull(f.second, f.opts);
  const store = (await loadState(f.second.home))!.links[0]!.store;
  await atomicWrite(store, "TOKEN=excluded\n");

  await setConfig(
    "env-files",
    JSON.stringify({ include: [".env.*"], exclude: [], extraSkipped: [] }),
    f.second.home,
  );

  const result = await push(f.second, f.opts);
  expect(result.changed).toBe(0);

  expect(
    result.reports.some(
      (message) => message.includes("Held back") && message.includes("env-files"),
    ),
  ).toBe(true);

  await pull(f.first, f.opts);
  expect(await Bun.file(f.aStore).text()).toBe("TOKEN=local-test-value\n");

  await setConfig(
    "env-files",
    JSON.stringify({ include: [".env", ".env.*"], exclude: [], extraSkipped: [] }),
    f.second.home,
  );
});

test("lost unpublished link content is reported and remains tracked", async () => {
  const { linkFile } = await import("../../links/file.ts");
  const { saveState } = await import("../../state/store/repository.ts");
  const { rm } = await import("node:fs/promises");
  const f = await fixture();
  const state = (await loadState(f.second.home))!;
  const path = join(f.checkoutB.root, ".env.new");
  await atomicWrite(path, "TOKEN=new\n");

  await linkFile(
    f.second,
    state,
    f.checkoutB,
    f.second.placement("link", f.checkoutB.root),
    ".env.new",
  );

  await saveState(f.second.home, state);
  await rm(state.links[0]!.store);
  const result = await push(f.second, f.opts);
  expect(result.conflicts).toBe(1);

  expect(
    result.reports.some((message) => message.includes(".env.new: content was lost outside envden")),
  ).toBe(true);

  expect((await loadState(f.second.home))!.links.some((link) => link.path === ".env.new")).toBe(
    true,
  );
});

test("removing an unpublished file only untracks locally", async () => {
  const { linkFile } = await import("../../links/file.ts");
  const { saveState } = await import("../../state/store/repository.ts");
  const { removeFile } = await import("../remove.ts");
  const f = await fixture();
  const state = (await loadState(f.second.home))!;
  const path = join(f.checkoutB.root, ".env.new");
  await atomicWrite(path, "TOKEN=new\n");

  await linkFile(
    f.second,
    state,
    f.checkoutB,
    f.second.placement("copy", f.checkoutB.root),
    ".env.new",
  );

  await saveState(f.second.home, state);
  const result = await removeFile(f.second, path, { yes: true, now: f.now });
  expect(result.publish).toBe("none");
  expect((await push(f.second, f.opts)).changed).toBe(0);

  expect((await loadState(f.second.home))!.links.some((link) => link.path === ".env.new")).toBe(
    false,
  );
});

test("failed removal never records deletion intent", async () => {
  const { removeFile } = await import("../remove.ts");
  const { deletionRequested } = await import("../local/reconciliation/operation/deletion.ts");
  const { rm, symlink } = await import("node:fs/promises");
  const f = await fixture();
  const targets = await approveLayout(f, ["copy", "copy"]);
  const destination = join(targets[1]!.root, ".env");
  await rm(destination);
  const unrelated = join(f.root, "unrelated-env");
  await atomicWrite(unrelated, "TOKEN=unrelated\n");
  await symlink(unrelated, destination);

  await Promise.resolve(
    expect(
      removeFile(f.second, join(targets[0]!.root, ".env"), { yes: true, now: f.now }),
    ).rejects.toThrow(),
  );

  expect(await deletionRequested(f.second.home, targets[0]!.store)).toBe(false);
  expect(await Bun.file(targets[0]!.store).text()).toBe("TOKEN=local-test-value\n");
  expect(await Bun.file(unrelated).text()).toBe("TOKEN=unrelated\n");
});

test("removal skips copies whose checkout needs approval", async () => {
  const { removeFile } = await import("../remove.ts");
  const f = await fixture();
  const targets = await approveLayout(f, ["copy", "copy"]);
  const original = f.second.repo.checkoutAt.bind(f.second.repo);

  f.second.repo.checkoutAt = async (root) => {
    const checkout = await original(root);

    return root === targets[1]!.root && checkout ? { ...checkout, identity: "changed" } : checkout;
  };

  const skipped = join(targets[1]!.root, ".env");

  const result = await removeFile(f.second, join(targets[0]!.root, ".env"), {
    yes: true,
    now: f.now,
  });

  expect(result.skipped).toEqual([skipped]);
  expect(await Bun.file(skipped).text()).toBe("TOKEN=local-test-value\n");
});
