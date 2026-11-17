import { retainedFixture } from "./fixtures/retained.ts";

import { expect, test } from "bun:test";
import { constants, Database } from "bun:sqlite";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as p from "@envden/core/protocol";
import { snapshot } from "../runtime/snapshot.ts";
import { Normalizer } from "../normalize/normalizer.ts";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

for (const mutation of ["blob", "header", "entry"]) {
  test(`collector rejects same-length retained ${mutation} corruption`, async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-integrity-"));

    try {
      const bytes = Buffer.from([0, 1, 2, 3]);
      const directory = join(root, "state", mutation === "blob" ? "blobs" : "headers");
      await mkdir(directory, { recursive: true });

      if (mutation === "blob") {
        const name = Buffer.from(p.H("blob", bytes)).toString("hex");
        bytes[3] = bytes[3]! ^ 1;
        await writeFile(join(directory, name), bytes);
      } else if (mutation === "header") {
        const token = bytes.toString("base64url");
        bytes[3] = bytes[3]! ^ 1;
        await writeFile(join(directory, sha(token)), bytes.toString("base64url"));
      } else {
        await writeFile(
          join(root, "state", "device.json"),
          JSON.stringify({ entries: [bytes.toString("base64url")] }),
        );
      }

      expect(
        await snapshot(root, new Normalizer()).then(
          () => false,
          (error: Error) => error.message === "Parity integrity validation failed",
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("independently randomized authenticated retained state compares equally", async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-valid-"));

  try {
    const observations = [];

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 37]) {
      const home = join(root, String(seed));
      await retainedFixture(home, seed, undefined, true);
      observations.push(await snapshot(home, new Normalizer()));
    }

    for (const observation of observations.slice(1)) expect(observation).toEqual(observations[0]!);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const mutation of [
  "entry",
  "header",
  "blob",
  "keyring",
  "files",
  "aead",
  "keyring-aead",
  "cached-state",
]) {
  for (const sqlite of [false, true]) {
    test(`authentic fixture rejects flipped ${mutation} byte (sqlite=${sqlite})`, async () => {
      const root = await mkdtemp(join(tmpdir(), "parity-auth-tamper-"));

      try {
        await retainedFixture(root, 7, mutation, sqlite);

        expect(
          await snapshot(root, new Normalizer()).then(
            () => false,
            (error: Error) => error.message === "Parity integrity validation failed",
          ),
        ).toBe(true);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
}

test("valid re-encryption cannot hide changed plaintext of the same length", async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-plaintext-"));

  try {
    const a = join(root, "a");
    const b = join(root, "b");
    await retainedFixture(a, 1);
    await retainedFixture(b, 37, "plaintext");
    const left = await snapshot(a, new Normalizer());
    const right = await snapshot(b, new Normalizer());

    const plaintext = (value: Record<string, string>) =>
      Object.entries(value).filter(([key]) => key.includes("/plaintext:"));

    expect(plaintext(left).length).toBeGreaterThan(0);
    expect(plaintext(left)).not.toEqual(plaintext(right));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collector rejects same-length signature corruption committed only to WAL", async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-wal-tamper-"));
  let db: Database | undefined;

  try {
    await retainedFixture(root, 7, undefined, true);
    db = new Database(join(root, "envden.sqlite"));
    db.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0);
    db.run("PRAGMA wal_autocheckpoint = 0");

    const entry = db
      .query<{ bytes: Uint8Array }, []>("SELECT bytes FROM entries WHERE rowid = 2")
      .get()!;

    entry.bytes[entry.bytes.length - 1] = entry.bytes[entry.bytes.length - 1]! ^ 1;
    db.run("UPDATE entries SET bytes = ? WHERE rowid = 2", [entry.bytes]);

    await Promise.resolve(
      expect(snapshot(root, new Normalizer())).rejects.toThrow(
        "Parity integrity validation failed",
      ),
    );
  } finally {
    db?.close();
    await rm(root, { recursive: true, force: true });
  }
});
