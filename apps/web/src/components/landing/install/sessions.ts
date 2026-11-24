import type { ISessionLine } from "@/components/landing/ui/typed/frame.ts";

export const SETUP_SESSION: ISessionLine[] = [
  { kind: "command", text: "envden setup" },
  { kind: "prompt", text: "Host the server on this machine? An always-on host is recommended." },
  { kind: "answer", text: "yes" },
  { kind: "prompt", text: "Server setup token" },
  { kind: "answer", text: "••••••••••••••••" },
  { kind: "prompt", text: "Device name" },
  { kind: "answer", text: "laptop" },
  { kind: "output", text: "Recovery code: ER1-7KQ2M-X9D4F-…" },
  { kind: "prompt", text: "Stored it?" },
  { kind: "answer", text: "yes" },
  { kind: "prompt", text: "Approve checkouts to track" },
  { kind: "answer", text: "~/code/shop  ~/code/api" },
];

export const DAILY_SESSION: ISessionLine[] = [
  { kind: "command", text: "envden status" },
  { kind: "output", text: "envden: server reachable" },
  { kind: "output", text: "envden: github.com/you/shop out of sync" },
  { kind: "command", text: "envden pull" },
  { kind: "prompt", text: "Merge changes to PORT, REDIS_URL?" },
  { kind: "answer", text: "yes" },
  { kind: "command", text: "envden push" },
];

export const APPROVER_SESSION: ISessionLine[] = [
  { kind: "pause", text: "" },
  { kind: "pause", text: "" },
  { kind: "command", text: "envden device approve" },
  { kind: "pause", text: "" },
  { kind: "prompt", text: "desktop wants to join. Words: tiger lamp river. Do they match?" },
  { kind: "answer", text: "yes" },
  { kind: "output", text: "Device desktop added" },
];

export const JOINER_SESSION: ISessionLine[] = [
  { kind: "command", text: "envden join <server>" },
  { kind: "output", text: "On a device already in the vault, run: envden device approve" },
  { kind: "pause", text: "" },
  { kind: "output", text: "Words: tiger lamp river" },
  { kind: "prompt", text: "Do they match the words on the approving device?" },
  { kind: "answer", text: "yes" },
  { kind: "output", text: "Joined as desktop" },
];
