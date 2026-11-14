import { H, equal } from "@envden/core/protocol";
import { existsSync, statSync, readdirSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TContext } from "../db/context.ts";

export function recoverBlobs(context: TContext, now: number): void {
  const { db, dataDir } = context;

  db.transaction(() => {
    const root = join(dataDir, "blobs");
    if (!existsSync(root)) return;

    for (const vault of readdirSync(root, { withFileTypes: true })) {
      if (!vault.isDirectory() || !/^(?:[a-f0-9]+|empty)$/.test(vault.name)) continue;
      recoverVault(context, root, vault.name, now);
    }
  }).immediate();
}

function recoverVault(context: TContext, root: string, name: string, now: number) {
  const vaultId = Buffer.from(name === "empty" ? "" : name, "hex");

  for (const file of readdirSync(join(root, name), { withFileTypes: true })) {
    if (!file.isFile()) continue;
    const temporary = file.name.startsWith(".tmp-");
    if (!temporary && !/^(?:[a-f0-9]+|empty)$/.test(file.name)) continue;
    const hash = Buffer.from(file.name === "empty" ? "" : file.name, "hex");

    recoverFile(context, join(root, name, file.name), vaultId, hash, temporary, now);
  }
}

function recoverFile(
  context: TContext,
  path: string,
  vaultId: Uint8Array,
  hash: Uint8Array,
  temporary: boolean,
  now: number,
) {
  const { bytes } = context;

  if (temporary) {
    unlinkSync(path);

    return;
  }

  if (!bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", vaultId, hash)) {
    if (!equal(H("blob", readFileSync(path)), hash)) {
      unlinkSync(path);

      return;
    }

    context.run("INSERT OR IGNORE INTO blobs VALUES(?,?)", vaultId, hash);
  }

  context.run(
    "INSERT OR IGNORE INTO blob_usage VALUES(?,?,?,?)",
    vaultId,
    hash,
    statSync(path).size,
    now,
  );
}
