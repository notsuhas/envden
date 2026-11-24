import { expect, test } from "bun:test";
import { unpackTar } from "modern-tar";
import { packBackup } from "../index.ts";

const bytes = new TextEncoder().encode("A=1\n");

test("files are 0600 under 0700 folders, with the given time", async () => {
  const long = `github.com/acme/${"x".repeat(150)}/.env`;

  const tar = await packBackup(
    [
      { name: "github.com/acme/api/.env", bytes },
      { name: long, bytes },
    ],
    1_700_000_000_000,
  );

  const entries = (await unpackTar(tar)).map((entry) => ({
    name: entry.header.name,
    mode: entry.header.mode,
    time: entry.header.mtime?.getTime(),
  }));

  expect(entries).toEqual([
    { name: "github.com/", mode: 0o700, time: 1_700_000_000_000 },
    { name: "github.com/acme/", mode: 0o700, time: 1_700_000_000_000 },
    { name: "github.com/acme/api/", mode: 0o700, time: 1_700_000_000_000 },
    { name: `github.com/acme/${"x".repeat(150)}/`, mode: 0o700, time: 1_700_000_000_000 },
    { name: "github.com/acme/api/.env", mode: 0o600, time: 1_700_000_000_000 },
    { name: long, mode: 0o600, time: 1_700_000_000_000 },
  ]);
});

test("duplicate, nested or unsafe names are refused", async () => {
  for (const names of [
    ["a/.env", "a/.env"],
    ["a/.env", "a/.env/b"],
    ["a/../.env"],
    ["/a/.env"],
    ["a//.env"],
    ["./.env"],
  ])
    await Promise.resolve(
      expect(
        packBackup(
          names.map((name) => ({ name, bytes })),
          0,
        ),
      ).rejects.toMatchObject({
        code: "INVALID_INPUT",
      }),
    );
});
