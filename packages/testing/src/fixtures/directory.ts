import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withDirectory(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "envden-contract-"));

  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
