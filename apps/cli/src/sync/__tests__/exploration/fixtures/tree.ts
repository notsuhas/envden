import {
  readdir,
  readFile,
  readlink,
  lstat,
  mkdir,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import { join, dirname } from "node:path";

type TEntry =
  | { kind: "directory"; path: string; mode: number }
  | { kind: "file"; path: string; mode: number; bytes: Uint8Array }
  | { kind: "link"; path: string; target: string };

export async function snapshotTree(root: string) {
  const entries: TEntry[] = [];
  const names = (await readdir(root)).filter((name) => name !== "server");

  async function visit(path: string): Promise<void> {
    const absolute = join(root, path);
    const stat = await lstat(absolute);

    if (stat.isSymbolicLink()) {
      entries.push({ kind: "link", path, target: await readlink(absolute) });
    } else if (stat.isDirectory()) {
      entries.push({ kind: "directory", path, mode: stat.mode });
      await Promise.all((await readdir(absolute)).map((name) => visit(join(path, name))));
    } else {
      entries.push({ kind: "file", path, mode: stat.mode, bytes: await readFile(absolute) });
    }
  }

  await Promise.all(names.map(visit));

  return async () => {
    await Promise.all(
      (await readdir(root))
        .filter((name) => name !== "server")
        .map((name) => rm(join(root, name), { recursive: true, force: true })),
    );

    await Promise.all(
      entries
        .filter((entry) => entry.kind === "directory")
        .map((entry) => mkdir(join(root, entry.path), { recursive: true, mode: entry.mode })),
    );

    await Promise.all(
      entries.map(async (entry) => {
        const path = join(root, entry.path);

        if (entry.kind === "link") await symlink(entry.target, path);
        else if (entry.kind === "file") {
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, entry.bytes, { mode: entry.mode });
        }
      }),
    );
  };
}
