import { test, expect } from "bun:test";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installAgent } from "../install.ts";

const fixtureClock = () => 1800000000000;

async function withHome(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "envden-agent-"));

  try {
    await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test("agent install is idempotent and links ~/.claude/skills/envden to ~/.agents/skills/envden", () =>
  withHome(async (home) => {
    await installAgent(home, fixtureClock);
    await installAgent(home, fixtureClock);

    expect(await readlink(join(home, ".claude", "skills", "envden"))).toBe(
      join(home, ".agents", "skills", "envden"),
    );

    expect(await readFile(join(home, ".agents", "skills", "envden", "SKILL.md"), "utf8")).toContain(
      "own terminal",
    );
  }));

test("agent install refuses a different skill at ~/.claude/skills/envden", () =>
  withHome(async (home) => {
    await mkdir(join(home, ".claude", "skills", "envden"), { recursive: true });

    await Promise.resolve(
      expect(installAgent(home, fixtureClock)).rejects.toThrow(
        "~/.claude/skills/envden already holds a different skill",
      ),
    );
  }));

test("agent install refuses a dangling link at ~/.claude/skills/envden", () =>
  withHome(async (home) => {
    await mkdir(join(home, ".claude", "skills"), { recursive: true });
    await symlink(join(home, "gone"), join(home, ".claude", "skills", "envden"));

    await Promise.resolve(
      expect(installAgent(home, fixtureClock)).rejects.toThrow(
        "~/.claude/skills/envden already holds a different skill",
      ),
    );
  }));

test("agent install refuses a different skill at ~/.agents/skills/envden and leaves it alone", () =>
  withHome(async (home) => {
    const foreign = join(home, ".agents", "skills", "envden", "SKILL.md");
    await mkdir(join(home, ".agents", "skills", "envden"), { recursive: true });
    await writeFile(foreign, "---\nname: something-else\n---\nmine\n");

    await Promise.resolve(
      expect(installAgent(home, fixtureClock)).rejects.toThrow(
        "~/.agents/skills/envden already holds a different skill",
      ),
    );

    expect(await readFile(foreign, "utf8")).toContain("mine");
  }));

// ~/.agents, ~/.claude/skills and ~/.codex/skills all link into one dotfiles folder
test("agent install writes once into a dotfiles folder shared by every agent and keeps the links", () =>
  withHome(async (home) => {
    const dotfiles = join(home, "dotfiles", "agents");
    await mkdir(join(dotfiles, "skills"), { recursive: true });
    await mkdir(join(home, ".claude"));
    await mkdir(join(home, ".codex"));
    await symlink(dotfiles, join(home, ".agents"));
    await symlink(join(dotfiles, "skills"), join(home, ".claude", "skills"));
    await symlink(join(dotfiles, "skills"), join(home, ".codex", "skills"));

    await installAgent(home, fixtureClock);
    await installAgent(home, fixtureClock);

    for (const link of [".agents", ".claude/skills", ".codex/skills"])
      expect((await lstat(join(home, link))).isSymbolicLink()).toBe(true);

    expect((await lstat(join(dotfiles, "skills", "envden"))).isDirectory()).toBe(true);

    for (const agent of [".claude", ".codex"])
      expect(await readFile(join(home, agent, "skills", "envden", "SKILL.md"), "utf8")).toContain(
        "own terminal",
      );
  }));

test("agent install writes through a SKILL.md that links into a dotfiles repo", () =>
  withHome(async (home) => {
    const tracked = join(home, "dotfiles", "envden.md");
    const file = join(home, ".agents", "skills", "envden", "SKILL.md");
    await mkdir(join(home, "dotfiles"));
    await mkdir(join(home, ".agents", "skills", "envden"), { recursive: true });
    await writeFile(tracked, "---\nname: envden\n---\nold\n");
    await symlink(tracked, file);

    await installAgent(home, fixtureClock);

    expect((await lstat(file)).isSymbolicLink()).toBe(true);
    expect(await readFile(tracked, "utf8")).toContain("own terminal");
  }));
