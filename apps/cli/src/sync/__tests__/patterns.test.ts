import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "../../state/store/files.ts";
import { pull, push } from "../engine.ts";
import { syncFixture } from "./flows.ts";

const fixtureClock = () => 1800000000000;

test("push and pull refuse an unsupported env file pattern before writing anything", async () => {
  const f = await syncFixture();

  try {
    await atomicWrite(f.aStore, "TOKEN=edited\n", fixtureClock);
    const config = { "env-files": { include: [".env.[a-z]*"] } };
    await writeFile(join(f.first.home, "config.json"), JSON.stringify(config));
    const state = join(f.first.home, "state", "device.json");
    const before = await readFile(state);

    for (const sync of [push, pull])
      await Promise.resolve(
        expect(sync(f.first, f.opts)).rejects.toMatchObject({
          code: "INVALID_INPUT",
          message: "Unsupported env file pattern",
        }),
      );

    expect(await readFile(state)).toEqual(before);
  } finally {
    await f.cleanup();
  }
});
