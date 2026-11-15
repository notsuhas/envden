interface IScreen {
  rows: string[][];
  x: number;
  y: number;
}

function escape(screen: IScreen, token: string) {
  const count = Number(token.slice(2, -1)) || 1;

  const actions: Record<string, () => void> = {
    A: () => {
      screen.y = Math.max(0, screen.y - count);
    },
    B: () => {
      screen.y += count;
    },
    D: () => {
      screen.x = Math.max(0, screen.x - count);
    },
    C: () => {
      screen.x += count;
    },
    G: () => {
      screen.x = count - 1;
    },
    J: () => {
      screen.rows.length = screen.y + 1;
      screen.rows[screen.y] = (screen.rows[screen.y] ?? []).slice(0, screen.x);
    },
    K: () => {
      screen.rows[screen.y] = token.includes("2")
        ? []
        : (screen.rows[screen.y] ?? []).slice(0, screen.x);
    },
  };

  actions[token.at(-1)!]?.();
}

function character(screen: IScreen, token: string) {
  if (token === "\r") {
    screen.x = 0;

    return;
  }

  if (token === "\n") {
    screen.y++;

    return;
  }

  if (token === "\b") {
    screen.x = Math.max(0, screen.x - 1);

    return;
  }

  screen.rows[screen.y] ??= [];
  screen.rows[screen.y]![screen.x++] = token;
}

export function terminalScreen(raw: string): string {
  const screen: IScreen = { rows: [[]], x: 0, y: 0 };
  // oxlint-disable-next-line no-control-regex -- Parse terminal escape sequences.
  const tokens = raw.match(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|[\s\S]/g) ?? [];

  for (const token of tokens) {
    if (token.startsWith("\x1b[")) escape(screen, token);
    else if (!token.startsWith("\x1b")) character(screen, token);
  }

  return (
    screen.rows
      .map((row) => row?.join("").trimEnd() ?? "")
      .join("\n")
      .trimEnd() + "\n"
  );
}
