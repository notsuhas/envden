interface IScreen {
  lines: string[][];
  row: number;
  col: number;
  redraw: boolean;
}

export function terminalText(raw: string): string {
  const screen: IScreen = { lines: [[]], row: 0, col: 0, redraw: false };
  // oxlint-disable-next-line no-control-regex -- Parse terminal escape sequences before rendering redraws.
  const tokens = raw.match(/\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]/gu) ?? [];

  for (const token of tokens) {
    if (token.startsWith("\x1b[")) control(screen, token);
    else character(screen, token);
  }

  return screen.lines
    .map((line) => line.join("").trimEnd())
    .filter((line) => !/^\s*[◒◐◓◑⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u.test(line))
    .join("\n")
    .trimEnd();
}

function control(screen: IScreen, token: string): void {
  const n = Number(token.slice(2, -1).split(";")[0]) || 1;
  const op = token.at(-1);

  const actions: Record<string, () => void> = {
    A: () => {
      screen.row = Math.max(0, screen.row - n);
    },
    B: () => {
      screen.row += n;
    },
    C: () => {
      screen.col += n;
    },
    D: () => {
      screen.col = Math.max(0, screen.col - n);
    },
    G: () => {
      screen.col = n - 1;
      if (screen.col === 0) screen.redraw = true;
    },
    K: () => eraseLine(screen, token),
    J: () => clearScreen(screen, token),
  };

  if (op) actions[op]?.();
}

function character(screen: IScreen, token: string): void {
  if (token.startsWith("\x1b")) return;

  if (token === "\r") {
    screen.col = 0;
    screen.redraw = true;

    return;
  }

  if (token === "\n") {
    screen.row++;
    screen.col = 0;
    screen.redraw = false;

    return;
  }

  if (token === "\b") {
    screen.col = Math.max(0, screen.col - 1);

    return;
  }

  if (token < " " && token !== "\t") return;

  if (screen.redraw) {
    screen.lines[screen.row] = [];
    screen.redraw = false;
  }

  screen.lines[screen.row] ??= [];
  screen.lines[screen.row]![screen.col++] = token;
}

function eraseLine(screen: IScreen, token: string): void {
  screen.lines[screen.row] ??= [];

  if (token.includes("2")) screen.lines[screen.row] = [];
  else screen.lines[screen.row]!.length = Math.min(screen.col, screen.lines[screen.row]!.length);
}

function clearScreen(screen: IScreen, token: string): void {
  if (!token.includes("2")) return;
  screen.lines.length = 0;
  screen.row = 0;
  screen.col = 0;
}
