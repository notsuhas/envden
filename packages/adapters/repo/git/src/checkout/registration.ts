import { lstat, readFile, realpath } from "node:fs/promises";
import { join, relative, resolve, isAbsolute } from "node:path";
import { git } from "../exec/git.ts";

export async function registeredWorktree(root: string, common: string): Promise<boolean> {
  try {
    const dotGit = join(root, ".git");
    const entry = await lstat(dotGit);
    if (!entry.isFile() || entry.isSymbolicLink()) return false;

    const privateDir = await realpath(
      resolve(root, (await git(root, ["rev-parse", "--git-dir"])).trimEnd()),
    );

    const worktrees = await lstat(join(common, "worktrees"));
    if (!worktrees.isDirectory() || worktrees.isSymbolicLink()) return false;
    const registrations = await realpath(join(common, "worktrees"));
    const name = relative(registrations, privateDir);

    if (!name || name.includes("/") || name.includes("\\") || name === ".." || isAbsolute(name))
      return false;

    const backlink = join(privateDir, "gitdir");
    if (!(await lstat(backlink)).isFile() || (await lstat(backlink)).isSymbolicLink()) return false;

    return (
      (await realpath(resolve(privateDir, (await readFile(backlink, "utf8")).trimEnd()))) ===
      (await realpath(dotGit))
    );
  } catch {
    return false;
  }
}
