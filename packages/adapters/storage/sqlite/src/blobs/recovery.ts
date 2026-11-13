import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { TContext } from "../db/context.ts";

export function recoverBlobs(context: TContext): void {
  const { db, dataDir } = context;

  db.transaction(() => {
    const root = join(dataDir, "blobs");
    if (!existsSync(root)) return;

    for (const vault of readdirSync(root, { withFileTypes: true })) {
      if (!vault.isDirectory() || !/^(?:[a-f0-9]+|empty)$/.test(vault.name)) continue;
      recoverVault(context, root, vault.name);
    }
  }).immediate();
}

function recoverVault(context: TContext, root: string, name: string) {
  const { bytes } = context;
  const vaultId = Buffer.from(name === "empty" ? "" : name, "hex");

  for (const file of readdirSync(join(root, name), { withFileTypes: true })) {
    if (!file.isFile()) continue;
    const temporary = file.name.startsWith(".tmp-");
    if (!temporary && !/^(?:[a-f0-9]+|empty)$/.test(file.name)) continue;
    const hash = Buffer.from(file.name === "empty" ? "" : file.name, "hex");

    if (
      temporary ||
      !bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", vaultId, hash)
    )
      unlinkSync(join(root, name, file.name));
  }
}
