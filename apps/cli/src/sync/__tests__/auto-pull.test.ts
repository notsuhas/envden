import { expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { push } from "../engine.ts";
import { conflictRecords } from "../local/conflicts.ts";
import { commandNotice } from "../../notice/command.ts";
import { cachedNotice } from "../../notice/cache.ts";
import { setConfig } from "../../settings/config.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { storePath } from "../../store/path.ts";
import { basePath } from "../local/files.ts";

const fixture = createSharedFixture();

async function backgroundRefresh(f: Awaited<ReturnType<typeof fixture>>) {
  await rm(join(f.second.home, "state", "remote-notice.json"), { force: true });
  await commandNotice(f.second, f.now(), f.fetcher, true);
}

test("the shell refresh names changed keys and writes nothing unless auto-pull is on", async () => {
  const f = await fixture(["copy"]);
  const target = join(f.targets[0]!.root, ".env");
  const pulled = join(f.second.home, "state", "notice-pulled");

  await atomicWrite(f.aStore, "TOKEN=server\n", f.now);
  await push(f.first, f.opts);
  await atomicWrite(f.aStore, "TOKEN=server\nSTRIPE_KEY=sk_test_never_shown\n", f.now);
  await push(f.first, f.opts);
  // A freshly joined device has no saved file lists, only its checkpoint.
  await rm(join(f.second.home, "state", "file-lists"), { recursive: true, force: true });
  await backgroundRefresh(f);

  const notice = await cachedNotice(f.second.home);

  expect(notice).toBe(
    "envden: round-target-0/.env 2 keys changed on first (TOKEN, STRIPE_KEY); run envden pull\n",
  );

  expect(await readFile(target, "utf8")).toBe("TOKEN=local-test-value\n");

  await setConfig("auto-pull", "on", f.second.home, f.now, false);
  await backgroundRefresh(f);

  expect(await readFile(target, "utf8")).toBe("TOKEN=server\nSTRIPE_KEY=sk_test_never_shown\n");
  expect(await optionalRead(pulled)).toBe("envden: pulled round-target-0/.env (2 keys)\n");
  expect(await cachedNotice(f.second.home)).toBe("");

  await rm(pulled);
  await atomicWrite(target, "TOKEN=mine\nSTRIPE_KEY=sk_test_never_shown\n", f.now);
  await atomicWrite(f.aStore, "TOKEN=theirs\nSTRIPE_KEY=sk_test_never_shown\n", f.now);
  await push(f.first, f.opts);
  await rm(join(f.second.home, "state", "file-lists"), { recursive: true, force: true });
  await backgroundRefresh(f);

  expect(await readFile(target, "utf8")).toBe("TOKEN=mine\nSTRIPE_KEY=sk_test_never_shown\n");
  expect(await optionalRead(pulled)).toBeUndefined();
  expect(await conflictRecords(f.second.home)).toEqual([]);
  expect(await cachedNotice(f.second.home)).toContain("1 key changed on first (TOKEN)");
});

for (const record of [".pending", ".entry"])
  test(`auto-pull leaves a file with an unreadable ${record} record for a manual pull`, async () => {
    const f = await fixture(["copy"]);
    const target = join(f.targets[0]!.root, ".env");
    const store = storePath(f.second.home, "github.com/example/project", ".env");
    const journal = basePath(f.second.home, store) + record;

    await setConfig("auto-pull", "on", f.second.home, f.now, false);
    await atomicWrite(f.aStore, "TOKEN=server\n", f.now);
    await push(f.first, f.opts);
    await atomicWrite(journal, "interrupted", f.now);
    await backgroundRefresh(f);

    expect(await readFile(target, "utf8")).toBe("TOKEN=local-test-value\n");
    expect(await optionalRead(journal)).toBe("interrupted");
    expect(await cachedNotice(f.second.home)).toContain("1 key changed on first (TOKEN)");
  });
