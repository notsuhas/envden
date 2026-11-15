import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Normalizer } from "../normalize/normalizer.ts";
import { prepare } from "../runtime/prepare.ts";

test("identical same-millisecond backups follow transcript order rather than random filenames", async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-prepare-"));
  try {
    const backup = join(root, "conflicts/backups");
    await mkdir(backup, { recursive: true });
    await writeFile(join(backup, "same-ms-a"), "literal");
    await writeFile(join(backup, "same-ms-z"), "literal");
    const normalizer = new Normalizer();
    await prepare(
      [{ home: root, checkout: root, binary: "unused", env: { ENVDEN_HOME: root } }],
      normalizer,
      [{ stdout: "Saved store: same-ms-z\nSaved checkout: same-ms-a\n", stderr: "", code: 0 }],
    );
    expect(normalizer.text("same-ms-z")).toEndWith(":1>");
    expect(normalizer.text("same-ms-a")).toEndWith(":2>");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
