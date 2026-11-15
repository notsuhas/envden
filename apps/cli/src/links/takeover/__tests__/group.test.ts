import { test, expect } from "bun:test";
import type { IOwnLink } from "../../file.ts";
import { groupOwnLinks, takeoverQuestion } from "../group.ts";
import { siblingLink } from "../sibling.ts";

const own = (root: string, target: string, registeredWorktree = false): IOwnLink => ({
  checkout: { root, gitDir: `${root}/.git`, repoId: "host/repo", registeredWorktree },
  path: ".env",
  link: target,
  target,
});

test("own links group by target and the question names the first checkout and the rest", () => {
  const shared = "/home/me/.config/dev-envs/app/.env";

  const groups = groupOwnLinks([
    own("/home/me/Work/app/main", shared),
    own("/home/me/Work/other", "/home/me/other.env"),
    own("/home/me/.t3/worktrees/app/feature", shared, true),
    own("/home/me/.codex/worktrees/app/fix", shared, true),
  ]);

  expect(groups.map((group) => [group.target, group.links.length])).toEqual([
    [shared, 3],
    ["/home/me/other.env", 1],
  ]);

  expect(takeoverQuestion(groups[0]!, "/home/me")).toStartWith(
    "~/Work/app/main/.env and 2 others link to ~/.config/dev-envs/app/.env.",
  );

  expect(takeoverQuestion(groups[1]!, "/home/me")).toStartWith(
    "~/Work/other/.env links to ~/other.env.",
  );
});

test("a link to an env file of the same checkout is a sibling, not a link to take over", () => {
  const files = [".env", ".env.development", "api/.env"];
  const link = (path: string, text: string) => ({ ...own("/w/app", ""), path, link: text });

  expect(siblingLink(link(".env", ".env.development"), files)).toBe(true);
  expect(siblingLink(link("api/.env", "../.env"), files)).toBe(true);
  expect(siblingLink(link(".env", "/w/app/.env.development"), files)).toBe(true);
  expect(siblingLink(link(".env", "config/dev.env"), files)).toBe(false);
  expect(siblingLink(link(".env", "/home/me/.config/app.env"), files)).toBe(false);
});
