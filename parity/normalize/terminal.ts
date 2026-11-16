interface IScreen {
  lines: string[][];
  row: number;
  col: number;
}

export function terminalText(raw: string): string {
  const screen: IScreen = { lines: [[]], row: 0, col: 0 };
  // oxlint-disable-next-line no-control-regex -- Parse terminal escape sequences before rendering redraws.
  const tokens = raw.match(/\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]/gu) ?? [];

  for (const token of tokens) {
    if (token.startsWith("\x1b[")) control(screen, token);
    else character(screen, token);
  }

  return Array.from(screen.lines, (line) =>
    Array.from(line ?? [], (char) => char ?? " ")
      .join("")
      .trimEnd(),
  )
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

    return;
  }

  if (token === "\n") {
    screen.row++;
    screen.col = 0;

    return;
  }

  if (token === "\b") {
    screen.col = Math.max(0, screen.col - 1);

    return;
  }

  if (token < " " && token !== "\t") return;

  screen.lines[screen.row] ??= [];
  screen.lines[screen.row]![screen.col++] = token;
}

function eraseLine(screen: IScreen, token: string): void {
  const mode = Number(token.slice(2, -1)) || 0;
  const line = (screen.lines[screen.row] ??= []);

  if (mode === 2) screen.lines[screen.row] = [];
  else if (mode === 1) {
    for (let col = 0; col <= screen.col; col++) line[col] = " ";
  } else line.length = Math.min(screen.col, line.length);
}

function clearScreen(screen: IScreen, token: string): void {
  const mode = Number(token.slice(2, -1)) || 0;

  if (mode === 2) screen.lines = [];
  else if (mode === 1) {
    for (let row = 0; row < screen.row; row++) screen.lines[row] = [];
    eraseLine(screen, "\x1b[1K");
  } else {
    eraseLine(screen, "\x1b[K");
    screen.lines.length = screen.row + 1;
  }
}
