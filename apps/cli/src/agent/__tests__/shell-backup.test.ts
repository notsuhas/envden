import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";

test("CLI shell wiring backs up rc files in private conflicts storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-shell-backup-"));

  const adapters = createAdapters({
    home: join(root, "envden"),
    userHome: root,
    keychain: createMemoryKeychainAdapter([]),
  });

  try {
    const original = "export LOCAL_CONFIG=1\n";
    await writeFile(join(root, ".zshrc"), original);
    await adapters.shell("zsh").install("/opt/envden");
    const backups = await readdir(join(adapters.home, "conflicts"));
    expect(backups).toHaveLength(1);
    const backup = join(adapters.home, "conflicts", backups[0]!);
    expect(await readFile(backup, "utf8")).toBe(original);
    if (process.platform !== "win32") expect((await stat(backup)).mode & 0o777).toBe(0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
