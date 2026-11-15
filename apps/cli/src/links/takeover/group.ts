import { join } from "node:path";
import { homePath } from "../../output/home-path.ts";
import type { IOwnLink } from "../file.ts";

export interface IOwnLinkGroup {
  target: string;
  links: IOwnLink[];
}

export function groupOwnLinks(links: IOwnLink[]): IOwnLinkGroup[] {
  const groups = new Map<string, IOwnLink[]>();

  for (const link of links) groups.set(link.target, [...(groups.get(link.target) ?? []), link]);

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([target, items]) => ({ target, links: items.toSorted(byDestination) }));
}

export function takeoverQuestion(group: IOwnLinkGroup, userHome: string): string {
  const [first, ...others] = group.links.map((link) =>
    homePath(join(link.checkout.root, link.path), userHome),
  );

  const who = others.length
    ? `${first} and ${others.length} ${others.length === 1 ? "other" : "others"} link`
    : `${first} links`;

  const [subject, object] = others.length ? ["Each checkout", "them"] : ["The checkout", "it"];

  return `${who} to ${homePath(group.target, userHome)}. Let envden manage it? ${subject} will use envden's synced copy instead of that file, and later edits to the file won't reach ${object}.`;
}

// the main clone leads the question, its worktrees follow
function byDestination(a: IOwnLink, b: IOwnLink) {
  return (
    Number(!!a.checkout.registeredWorktree) - Number(!!b.checkout.registeredWorktree) ||
    join(a.checkout.root, a.path).localeCompare(join(b.checkout.root, b.path))
  );
}
