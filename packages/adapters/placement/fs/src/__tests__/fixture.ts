import { afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

export async function setup() {
  const root = await mkdtemp(join(tmpdir(), "envden-placement-"));
  roots.push(root);
  const checkout = join(root, "checkout");
  await mkdir(checkout);
  const store = join(root, "store");
  await writeFile(store, "A=secret\n");

  return { root, checkout, store };
}
