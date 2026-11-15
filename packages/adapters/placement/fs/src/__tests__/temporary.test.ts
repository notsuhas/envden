import { place } from "../operations/place.ts";
import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setup } from "./fixture.ts";
import { createFsPlacementAdapter } from "../adapter.ts";
import { temporaryName } from "../paths/temporary.ts";

test("copy prepares its exclusion before writing and replaces a leftover for this destination", async () => {
  const { checkout, store } = await setup();
  const destination = join(checkout, ".env");
  const temporary = temporaryName(".env");
  const adapter = createFsPlacementAdapter("copy", checkout, undefined, () => 1800000000000);
  await rejects(adapter.place(store, destination), /exclude/);
  let calls = 0;

  await adapter.place(store, destination, async (path) => {
    expect(await readdir(checkout)).toEqual([]);
    expect(path).toBe(temporary);
    calls++;
  });

  await writeFile(join(checkout, temporary), "LEFTOVER=secret");

  await adapter.place(store, destination, async (path) => {
    expect(path).toBe(temporary);
    calls++;
  });

  expect(calls).toBe(2);
  expect(await readdir(checkout)).toEqual([".env"]);
  expect(await readFile(destination, "utf8")).toBe("A=secret\n");
  expect(temporaryName("nested/.env")).not.toBe(temporary);
  await writeFile(join(checkout, temporary), "LEFTOVER=secret");

  await place(
    "copy",
    checkout,
    store,
    destination,
    undefined,
    { platform: process.platform, libc: undefined },
    async (path) => {
      expect(path).toBe(temporary);
    },
    () => 1800000000000,
  );

  expect(await readdir(checkout)).toEqual([".env"]);
});
