import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeKitPdf } from "../save.ts";

const bytes = new TextEncoder().encode("%PDF-1.7 test");

test("kit PDFs are private and never overwrite an earlier kit", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-kit-save-"));

  try {
    const first = await writeKitPdf(root, "GAV85NQ7XK", bytes);
    const second = await writeKitPdf(root, "GAV85NQ7XK", new Uint8Array([1]));

    expect(first).toBe(join(root, "envden Recovery Kit GAV85N.pdf"));
    expect(second).toBe(join(root, "envden Recovery Kit GAV85N (2).pdf"));
    expect(await Bun.file(first).text()).toStartWith("%PDF-");
    if (process.platform !== "win32") expect((await stat(first)).mode & 0o777).toBe(0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("kit PDFs write through a symlinked folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-kit-link-"));

  try {
    await mkdir(join(root, "target"));
    await symlink(join(root, "target"), join(root, "Downloads"));
    await writeKitPdf(join(root, "Downloads"), "GAV85NQ7XK", bytes);

    expect(await readdir(join(root, "target"))).toEqual(["envden Recovery Kit GAV85N.pdf"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
