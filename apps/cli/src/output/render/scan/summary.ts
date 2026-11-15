interface ISkipCounts {
  remote?: number;
  identity?: number;
  ownLinks?: number;
}

export function skippedSummary(counts: ISkipCounts, command: string): string | undefined {
  const parts = [
    counted(counts.remote, "repo without a usable git remote", "repos without a usable git remote"),
    counted(counts.identity, "repo envden couldn't identify", "repos envden couldn't identify"),
    counted(
      counts.ownLinks,
      "env file that is your own symlink",
      "env files that are your own symlinks",
    ),
  ].filter((part) => part !== undefined);

  if (!parts.length) return undefined;

  const total = (counts.remote ?? 0) + (counts.identity ?? 0) + (counts.ownLinks ?? 0);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];

  return `Skipped ${list}. Run ${command} --verbose to list ${total === 1 ? "it" : "them"}.`;
}

function counted(count: number | undefined, one: string, many: string) {
  return count ? `${count} ${count === 1 ? one : many}` : undefined;
}
