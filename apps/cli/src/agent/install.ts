import { lstat, mkdir, readFile, realpath, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { SITE_URL } from "@envden/core/site";
import { writeThrough } from "./write-through.ts";

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
  const file = join(target, "SKILL.md");

  if (!ownSkill(await readFile(file, "utf8").catch(missing)))
    throw new EnvdenError("CONFLICT", "~/.agents/skills/envden already holds a different skill");

  await writeThrough(file, skill, now);
  await mkdir(dirname(link), { recursive: true });

  // Codex reads ~/.agents/skills itself; ~/.claude/skills often links to that same folder
  if (!(await lstat(link).catch(missing)))
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  else if ((await realpath(link).catch(missing)) !== (await realpath(target)))
    throw new EnvdenError("CONFLICT", "~/.claude/skills/envden already holds a different skill");
}

function ownSkill(text: string | undefined) {
  return text === undefined || /^name: envden$/m.test(text.split("\n---")[0] ?? "");
}

function missing(cause: unknown): undefined {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
  throw cause;
}
