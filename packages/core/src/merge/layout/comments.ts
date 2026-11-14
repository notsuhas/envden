import type { IEnvEntry } from "../types.ts";

function commentOwners(entries: IEnvEntry[]) {
  const owners = new Map<string, Set<string>>();

  for (const entry of entries) {
    const lines = Buffer.from(entry.raw).toString("latin1").split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    lines.pop();
    const block = lines.filter((line) => line.trim()).join("\n");
    if (!block) continue;
    const keys = owners.get(block) ?? new Set<string>();
    keys.add(entry.key);
    owners.set(block, keys);
  }

  return owners;
}

export function commentsMovedApart(base: IEnvEntry[], local: IEnvEntry[], remote: IEnvEntry[]) {
  const b = commentOwners(base);
  const l = commentOwners(local);
  const r = commentOwners(remote);

  for (const [block, keys] of b) {
    const mine = l.get(block);
    const theirs = r.get(block);
    if (!mine || !theirs) continue;

    for (const key of keys) {
      if (mine.has(key) || theirs.has(key)) continue;
      if ([...mine].some((owner) => !theirs.has(owner))) return true;
    }
  }

  return false;
}
