import { Terminal } from "@/components/landing/ui/terminal.tsx";
import type { ITerminalLine } from "@/components/landing/ui/terminal.tsx";

const LINES: ITerminalLine[] = [
  { kind: "command", text: "cd ~/code/shop" },
  { kind: "output", text: "envden: out of sync" },
];

export function ShellFigure() {
  return <Terminal lines={LINES} caption="An illustration. The exact wording isn't final." />;
}
