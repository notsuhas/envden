import { expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { create } from "tar";
import { extractBinary } from "../self/archive.ts";
import { writeReleaseArchive } from "../../../scripts/archive.ts";

const binary = new TextEncoder().encode("#!/bin/sh\necho envden\n");

async function inTemp<T>(action: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "envden-archive-test-"));

  try {
    return await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function releaseArchive() {
  return inTemp(async (directory) => {
    await writeFile(join(directory, "binary"), binary);

    await writeReleaseArchive(
      join(directory, "binary"),
      resolve(import.meta.dir, "../../../../../LICENSE"),
      join(directory, "out.tar.gz"),
    );

    return Bun.file(join(directory, "out.tar.gz")).bytes();
  });
}

function linkArchive(name: string) {
  return inTemp(async (directory) => {
    await writeFile(join(directory, "envden"), binary);
    await symlink("/etc/hosts", join(directory, "evil"));
    const output = join(directory, "out.tar.gz");
    await create({ file: output, cwd: directory, gzip: true, portable: true }, ["envden", name]);

    return Bun.file(output).bytes();
  });
}

test("release archives are reproducible and extract to the binary", async () => {
  const archive = await releaseArchive();

  expect(await releaseArchive()).toEqual(archive);
  expect(await extractBinary(archive)).toEqual(binary);
});

test.each([
  ["traversal", () => new Bun.Archive({ "../envden": binary }, { compress: "gzip" }).bytes()],
  ["absolute path", () => new Bun.Archive({ "/envden": binary }, { compress: "gzip" }).bytes()],
  [
    "unexpected file",
    () => new Bun.Archive({ envden: binary, extra: "x" }, { compress: "gzip" }).bytes(),
  ],
  ["symlink", () => linkArchive("evil")],
])("release archive with a %s entry is rejected", async (_, archive) => {
  await Promise.resolve(expect(extractBinary(await archive())).rejects.toThrow("Unexpected entry"));
});

test("release archive without the binary is rejected", async () => {
  const archive = await new Bun.Archive({ LICENSE: "MIT" }, { compress: "gzip" }).bytes();

  await Promise.resolve(expect(extractBinary(archive)).rejects.toThrow("no envden binary"));
});

test("release archive past the size limit is rejected", async () => {
  const archive = await releaseArchive();

  await Promise.resolve(expect(extractBinary(archive, 1024)).rejects.toThrow("too large"));
});

test.each([
  ["not gzip", binary, "not gzip"],
  ["not tar", gzipSync(new Uint8Array(4096).fill(7)), "not a tar file"],
])("release archive that is %s is rejected", async (_, archive, message) => {
  await Promise.resolve(expect(extractBinary(archive)).rejects.toThrow(message));
});
