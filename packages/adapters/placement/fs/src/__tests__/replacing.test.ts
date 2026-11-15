import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import { lstat, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setup } from "./fixture.ts";
import { place } from "../operations/place.ts";

const fallback = { platform: "win32" as const, libc: undefined };

test("fallback replaces a user's link only when given its exact text", async () => {
  const { root, checkout, store } = await setup();
  const destination = join(checkout, ".env");
  const original = join(root, "original");
  await writeFile(original, "KEEP=1\n");
  await symlink(original, destination);

  const placeOver = (replacing: string) =>
    place(
      "link",
      checkout,
      store,
      destination,
      undefined,
      fallback,
      async () => {},
      () => 1,
      replacing,
    );

  await rejects(placeOver(join(root, "other")), /unrelated/);
  await placeOver(original);
  expect((await lstat(destination)).isSymbolicLink()).toBe(true);
  expect(await readFile(destination)).toEqual(await readFile(store));
  expect(await readFile(original, "utf8")).toBe("KEEP=1\n");
});
