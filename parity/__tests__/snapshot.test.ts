import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Normalizer } from "../normalize/normalizer.ts";
import { snapshot } from "../runtime/snapshot.ts";

async function tree(root: string, names: string[]): Promise<void> {
  await mkdir(join(root, "files"));
  await writeFile(join(root, ".env"), "TOKEN=<BYTES:32#1> sha256:STRUCTURE\n");

  for (const [i, name] of names.entries())
    await writeFile(
      join(root, "files", name),
      `role=${["é", "e\u0301", "plain"][i]}\nnext=${names[(i + 1) % names.length]}\n`,
    );

  await writeFile(join(root, "references"), names.join("\n"));
  await symlink(`files/${names[1]}`, join(root, "link"));
}

async function mutate(root: string, names: string[], mutation: string): Promise<void> {
  const path = join(root, "files", names[0]!);

  switch (mutation) {
    case "literal":
      await writeFile(join(root, ".env"), "TOKEN=<BYTES:32#2> sha256:STRUCTURE\n");

      return;
    case "content":
      await writeFile(path, "changed\n");

      return;
    case "missing":
      await rm(path);

      return;
    case "extra":
      await writeFile(join(root, "files", "ab".repeat(32)), "extra\n");

      return;
    case "mode":
      await chmod(path, 0o700);

      return;
    case "link":
      await rm(join(root, "link"));
      await symlink(`files/${names[0]}`, join(root, "link"));

      return;
    case "reference":
      await writeFile(join(root, "references"), [names[0], names[0], names[2]].join("\n"));
  }
}

for (const mutation of [
  "none",
  "content",
  "missing",
  "extra",
  "mode",
  "link",
  "reference",
  "literal",
]) {
  test(`random filename order preserves observations: ${mutation}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-canonical-test-"));
    const left = join(root, "left");
    const right = join(root, "right");
    const a = ["aa", "bb", "cc"].map((s) => s.repeat(32));
    const b = ["ee", "dd", "ff"].map((s) => s.repeat(32));
    await mkdir(left);
    await mkdir(right);

    try {
      await tree(left, a);
      await tree(right, b);

      await mutate(right, b, mutation);

      const observed = await snapshot(left, new Normalizer());
      const candidate = await snapshot(right, new Normalizer());

      expect(candidate[".env:content"]).toBe(
        `TOKEN=<BYTES:32#${mutation === "literal" ? 2 : 1}> sha256:STRUCTURE\n`,
      );

      if (mutation === "none") expect(candidate).toEqual(observed);
      else expect(candidate).not.toEqual(observed);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("interchangeable names and symmetric reference cycles canonicalize exactly", async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-canonical-ties-"));

  try {
    const observations: Record<string, string>[] = [];

    for (const [run, bytes] of [
      ["left", [171, 172, 173, 174]],
      ["right", [190, 189, 188, 187]],
    ] satisfies [string, number[]][]) {
      const path = join(root, run);
      await mkdir(path);
      const names = bytes.map((byte) => Buffer.alloc(32, byte).toString("hex"));
      for (const name of names) await writeFile(join(path, name), "same\n");
      const db = new Database(join(path, "evidence.sqlite"));
      db.run("CREATE TABLE nonces (device BLOB, nonce BLOB, peer TEXT)");

      for (const i of run === "left" ? [0, 1, 2, 3] : [3, 1, 0, 2])
        db.run("INSERT INTO nonces VALUES (?, ?, ?)", [
          Buffer.from(names[i]!, "hex"),
          Buffer.alloc(16, bytes[i]!),
          names[(i + 1) % names.length]!,
        ]);

      db.close();
      observations.push(await snapshot(path, new Normalizer()));
    }

    expect(observations[0]).toEqual(observations[1]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
