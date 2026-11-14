export interface ISessionLine {
  kind: "command" | "prompt" | "answer" | "output" | "pause";
  text: string;
}

interface ISessionFrame {
  lines: ISessionLine[];
  typing: boolean;
}

const INSTANT_TICKS = 5;
const AFTER_TYPED_TICKS = 6;
const HOLD_TICKS = 50;

function typed(line: ISessionLine): boolean {
  return line.kind === "command" || line.kind === "answer";
}

function lineTicks(line: ISessionLine): number {
  return typed(line) ? line.text.length + AFTER_TYPED_TICKS : INSTANT_TICKS;
}

export function sessionTicks(lines: ISessionLine[]): number {
  return lines.reduce((total, line) => total + lineTicks(line), 0) + HOLD_TICKS;
}

// what a terminal shows after a number of ticks: finished lines, then one being typed
export function sessionFrame(lines: ISessionLine[], tick: number): ISessionFrame {
  const shown: ISessionLine[] = [];
  let left = tick;

  for (const line of lines) {
    if (left <= 0) return { lines: shown, typing: false };

    if (typed(line) && left < line.text.length) {
      shown.push({ kind: line.kind, text: line.text.slice(0, left) });

      return { lines: shown, typing: true };
    }

    shown.push(line);
    left -= lineTicks(line);
  }

  return { lines: shown, typing: false };
}
