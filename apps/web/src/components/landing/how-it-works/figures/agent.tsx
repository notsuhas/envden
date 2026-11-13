import { Terminal } from "@/components/landing/ui/terminal.tsx";
import type { ITerminalLine } from "@/components/landing/ui/terminal.tsx";

const LINES: ITerminalLine[] = [
  { kind: "command", text: "envden agent install" },
  { kind: "command", text: "envden status --json" },
  { kind: "command", text: "envden doctor --json" },
];

export function AgentFigure() {
  return <Terminal lines={LINES} />;
}
