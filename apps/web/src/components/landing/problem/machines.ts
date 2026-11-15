const SAME = [
  "# shop",
  "API_KEY=sk_test_new",
  "DB_URL=postgres://shop",
  "PORT=3000",
  "REDIS_URL=redis://cache",
];

export const DRIFT_MACHINES = [
  {
    name: "laptop",
    state: "edited here",
    current: true,
    lines: SAME.map((same) => ({ same, drifted: same })),
  },
  {
    name: "remote dev box",
    state: "stale",
    current: false,
    lines: SAME.map((same, row) => ({ same, drifted: row === 1 ? "API_KEY=sk_test_old" : same })),
  },
  {
    name: "agent worktree",
    state: "empty",
    current: false,
    lines: SAME.map((same, row) => ({ same, drifted: row === 0 ? "# no .env yet" : "" })),
  },
];
