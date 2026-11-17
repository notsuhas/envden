export interface IShard {
  index: number;
  count: number;
}

// Seconds per scenario on a macOS runner, TS against TS; unlisted scenarios count as the median.
const COST: Record<string, number> = {
  "channel-probe": 1,
  help: 22,
  "errors-config": 12,
  settings: 8,
  "local-state": 12,
  "user-flow": 54,
  "pairing-sync": 44,
  "recovery-sync": 49,
  "conflict-edit": 37,
  "conflict-keep-mine": 31,
  "conflict-take-server": 38,
  "shared-vault": 50,
  unreachable: 8,
  "files-worktrees": 32,
  "symlink-takeover": 10,
  "file-options": 15,
  "resolution-options": 48,
  "directory-collision": 13,
  "onboarding-errors": 6,
  "onboarding-options": 9,
  "join-local-file-choice": 8,
  "rejoin-after-removal": 26,
  "pairing-secret": 17,
  "recovery-pdf": 15,
  "locked-session": 15,
  "host-here": 4,
  "devices-vault": 34,
  maintenance: 23,
  "server-move": 27,
  "server-move-interrupted": 46,
  "server-repair": 19,
  "server-repair-without": 17,
  "server-repair-lost": 12,
};

const MEDIAN = 17;

export function parseShard(value: string): IShard | undefined {
  const match = /^(\d+)\/(\d+)$/.exec(value);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);

  return index >= 1 && index <= count ? { index, count } : undefined;
}

// Longest first onto the lightest shard, so every shard gets a similar share of the run time.
export function inShard(names: string[], shard: IShard): Set<string> {
  const cost = (name: string) => COST[name] ?? MEDIAN;
  const loads = Array.from({ length: shard.count }, () => ({ total: 0, names: new Set<string>() }));
  const ordered = [...names].sort((a, b) => cost(b) - cost(a) || a.localeCompare(b));

  for (const name of ordered) {
    const lightest = loads.reduce((min, load) => (load.total < min.total ? load : min));

    lightest.total += cost(name);
    lightest.names.add(name);
  }

  return loads[shard.index - 1]!.names;
}
