import { Terminal } from "@/components/landing/ui/terminal.tsx";
import type { ITerminalLine } from "@/components/landing/ui/terminal.tsx";

const LINES: ITerminalLine[] = [
  { kind: "command", text: "envden push", note: "this repo" },
  { kind: "command", text: "envden pull" },
  { kind: "command", text: "envden pull --all", note: "every repo" },
  { kind: "command", text: "envden resolve --keep-mine" },
];

export function SyncFigure() {
  return <Terminal lines={LINES} />;
}
