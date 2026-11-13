const SAME = [
  "# shop",
  "API_KEY=sk_test_example",
  "DB_URL=postgres://shop",
  "PORT=3000",
  "REDIS_URL=redis://cache",
];

export const DRIFT_MACHINES = [
  {
    name: "laptop",
    lines: SAME.map((same, row) => ({ same, drifted: row === 3 ? "PORT=3001" : same })),
  },
  {
    name: "desktop",
    lines: SAME.map((same, row) => ({ same, drifted: row === 4 ? "" : same })),
  },
  {
    name: "new worktree",
    lines: SAME.map((same, row) => ({ same, drifted: row === 0 ? "# no .env yet" : "" })),
  },
];
