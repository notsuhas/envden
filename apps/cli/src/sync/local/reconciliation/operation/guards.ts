import { join } from "node:path";
import { base32, sha256 } from "@envden/core/protocol";
import type { TSyncContext } from "../../../remote/context.ts";
import { readBytes } from "../../files.ts";

type TTarget = TSyncContext["state"]["links"][number];

export function contentHash(bytes: Uint8Array | undefined) {
  return bytes === undefined ? null : base32(sha256(bytes));
}

export async function operationHashes(context: TSyncContext, store: string, targets: TTarget[]) {
  const stored = await readBytes(store);
  const hashes = [contentHash(stored)];

  for (const target of targets) {
    const path = join(target.root, target.path);
    const status = await context.adapters.placement(target.mode, target.root).inspect(store, path);
    hashes.push(contentHash(status === "linked" ? stored : await readBytes(path)));
  }

  return hashes;
}

export function canResume(
  before: (string | null)[],
  current: (string | null)[],
  next: string | null,
) {
  return (
    before.length === current.length &&
    current.every((hash, i) => hash === before[i] || hash === next)
  );
}
