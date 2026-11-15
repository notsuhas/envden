import type { ISessionLine } from "@/components/landing/ui/typed/frame.ts";

const WAIT_FOR_YOU: ISessionLine[] = Array.from({ length: 8 }, () => ({
  kind: "pause",
  text: "",
}));

export const AGENT_SESSION: ISessionLine[] = [
  ...WAIT_FOR_YOU,
  { kind: "command", text: "git worktree add ../shop-login" },
  { kind: "command", text: "cd ../shop-login && envden pull" },
  { kind: "output", text: "Approved worktree ~/code/shop-login (auto-approve-worktrees)" },
  { kind: "output", text: '{"kind":"pulled","changed":1,"conflicts":0}' },
];

export const USER_SESSION: ISessionLine[] = [
  { kind: "command", text: "envden track ~/code/shop" },
  { kind: "prompt", text: "Approve env files in ~/code/shop?" },
  { kind: "answer", text: "yes" },
];
