import { lstat, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { SITE_URL } from "@envden/core/site";
import { atomicWrite } from "../state/store/files.ts";

const skill = `---
name: envden
description: Sync this checkout's env files with envden.
---
Commands and flags: ${SITE_URL}/docs/cli
Syncing and conflicts: ${SITE_URL}/docs/push-pull-merge
Agent rules: ${SITE_URL}/docs/agents

Run envden status --json before syncing. Run envden push --yes or envden pull --yes only when the user asks.
Never read or print env values.
Ask the user to enter the master password, pairing codes and recovery secrets, and to approve checkouts, in their own terminal.
Run envden rm only when the user asks to delete that env file everywhere.
Never resolve conflicts without the user's approval. If envden config agent-merge is on, you may help edit a conflict file.
Use envden update --check freely; ask before running envden update.
`;

export async function installAgent(userHome: string, now: () => number): Promise<void> {
  const target = join(userHome, ".agents", "skills", "envden");
  const link = join(userHome, ".claude", "skills", "envden");
  await atomicWrite(join(target, "SKILL.md"), skill, now);
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
