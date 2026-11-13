import { lstat, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { atomicWrite } from "../state/store/files.ts";

const skill = `---
name: envden
description: Sync this checkout's env files with envden.
---
Run envden status --json before syncing. Use envden push --yes or envden pull --yes only when asked.
Never read or print env values. Ask the user to run password entry, pairing codes and checkout approval in their own terminal.
Never resolve conflicts or update the binary without the user's approval. Use envden update --check to check releases.
`;

export async function installAgent(userHome: string): Promise<void> {
  const target = join(userHome, ".agents", "skills", "envden");
  const link = join(userHome, ".claude", "skills", "envden");
  await atomicWrite(join(target, "SKILL.md"), skill);
  await mkdir(join(userHome, ".claude", "skills"), { recursive: true });

  try {
    const existing = await lstat(link);

    if (!existing.isSymbolicLink())
      throw new EnvdenError("CONFLICT", "Agent skill destination is an existing folder or file");

    const { realpath } = await import("node:fs/promises");

    if ((await realpath(link)) !== (await realpath(target)))
      throw new EnvdenError("CONFLICT", "Agent skill destination already exists");
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    else throw cause;
  }
}
