import { expect, test } from "bun:test";
import { join } from "node:path";
import { rm, readFile } from "node:fs/promises";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { linkCheckout } from "../../links/place.ts";
import { setConfig } from "../../settings/config.ts";
import { push, pull } from "../engine.ts";
import { conflictRecords } from "../local/conflicts.ts";
import { resolveConflict } from "../resolve.ts";

const fixture = createSharedFixture();

test("restore preserves the copy edit on mine and real server on theirs", async () => {
  const f = await fixture();
  const [target] = await approveLayout(f, ["copy"]);
  await atomicWrite(f.aStore, "TOKEN=server-edit\n", f.now);
  await push(f.first, f.opts);
  await rm(target!.store);
  const path = join(target!.root, ".env");
  await atomicWrite(path, "TOKEN=copy-edit\n", f.now);

  expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  const [record] = await conflictRecords(f.second.home);
  expect(await readFile(record!.mine, "utf8")).toBe("TOKEN=copy-edit\n");
  expect(await readFile(record!.server, "utf8")).toBe("TOKEN=server-edit\n");
  await resolveConflict(f.second, { file: ".env", choice: "keep-mine", now: f.now });
  expect(await readFile(path, "utf8")).toBe("TOKEN=copy-edit\n");
});

test("unpublished local conflicts cannot take a nonexistent server side", async () => {
  const f = await fixture();

  await setConfig(
    "placement",
    JSON.stringify({ [f.checkoutB.root]: "copy" }),
    f.second.home,
    () => 0,
  );

  await pull(f.second, f.opts);
  const path = join(f.checkoutB.root, ".env.new");
  await atomicWrite(path, "A=1\n", f.now);
  const state = (await loadState(f.second.home))!;
  f.second.repo.envFiles = async () => [".env.new"];
  await linkCheckout(f.second, state, f.checkoutB, async () => true, true);
  await saveState(f.second.home, state, f.now);
  await pull(f.second, f.opts);
  const link = (await loadState(f.second.home))!.links.find((item) => item.path === ".env.new")!;
  await atomicWrite(link.store, "A=store\n", f.now);
  await atomicWrite(path, "A=copy\n", f.now);

  expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  const record = (await conflictRecords(f.second.home)).find((item) => item.path === ".env.new")!;
  expect(record.deleted).toBe(false);

  await Promise.resolve(
    expect(
      resolveConflict(f.second, { file: ".env.new", choice: "take-server", now: f.now }),
    ).rejects.toThrow("No server entry"),
  );

  expect(await readFile(link.store, "utf8")).toBe("A=store\n");
  expect(await readFile(path, "utf8")).toBe("A=copy\n");
});
