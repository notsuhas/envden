import type { ISessionLine } from "@/components/landing/ui/typed/frame.ts";

export const SETUP_SESSION: ISessionLine[] = [
  { kind: "command", text: "envden setup" },
  { kind: "prompt", text: "Host the server on this machine? An always-on host is recommended." },
  { kind: "answer", text: "yes" },
  { kind: "prompt", text: "Server setup token" },
  { kind: "answer", text: "••••••••••••••••" },
  { kind: "prompt", text: "Device name" },
  { kind: "answer", text: "laptop" },
  { kind: "prompt", text: "Master password" },
  { kind: "answer", text: "••••••••••••" },
  { kind: "prompt", text: "Confirm master password" },
  { kind: "answer", text: "••••••••••••" },
  { kind: "output", text: "Store this recovery kit like a passport." },
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
  { kind: "command", text: "envden device add" },
  { kind: "prompt", text: "Master password" },
  { kind: "answer", text: "••••••••••••" },
  { kind: "output", text: "3-K7QF-2MXP" },
  { kind: "output", text: "" },
  { kind: "output", text: "" },
  { kind: "prompt", text: "Add desktop?" },
  { kind: "answer", text: "yes" },
];

export const JOINER_SESSION: ISessionLine[] = [
  { kind: "output", text: "" },
  { kind: "output", text: "" },
  { kind: "output", text: "" },
  { kind: "command", text: "envden join <server>" },
  { kind: "prompt", text: "Pairing code" },
  { kind: "answer", text: "•••••••••••" },
  { kind: "output", text: "Waiting for the approving device" },
];
