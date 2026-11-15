import type { IMemoryContext } from "./data.ts";

const sum = (sizes: number[]) => sizes.reduce((total, size) => total + size, 0);

export function vaultUsage(context: IMemoryContext, vault: string): number {
  const { blobs, lists, states } = context.data;

  return sum([
    ...[...blobs.values()].filter((blob) => blob.vault === vault).map((blob) => blob.bytes.length),
    ...[...lists.values()]
      .filter((list) => list.vault === vault)
      .map((list) => list.files.bytes.length),
    ...[...states.values()]
      .filter((state) => state.vault === vault && state.kind === "keyring")
      .map((state) => state.bytes.length),
  ]);
}
