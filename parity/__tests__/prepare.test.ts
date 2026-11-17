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

    await prepare([{ env: { ENVDEN_HOME: root } }], normalizer, [
      { stdout: "Saved store: same-ms-z\nSaved checkout: same-ms-a\n", stderr: "", code: 0 },
    ]);

    expect(normalizer.text("same-ms-z")).toEndWith(":1>");
    expect(normalizer.text("same-ms-a")).toEndWith(":2>");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state anchors follow JSON keys rather than serialization order", async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-state-anchors-"));

  try {
    const observed: string[] = [];

    for (const [i, entries] of [
      [
        ["keyring", "aa".repeat(32)],
        ["checkpoint", "bb".repeat(32)],
      ],
      [
        ["checkpoint", "cc".repeat(32)],
        ["keyring", "dd".repeat(32)],
      ],
    ].entries()) {
      const home = join(root, String(i));
      await mkdir(join(home, "state"), { recursive: true });
      await writeFile(join(home, "state/device.json"), JSON.stringify(Object.fromEntries(entries)));
      const normalizer = new Normalizer();
      await prepare([{ env: { ENVDEN_HOME: home } }], normalizer, []);
      observed.push(normalizer.text(entries.find(([key]) => key === "keyring")![1]!));
    }

    expect(observed[0]).toBe(observed[1]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
