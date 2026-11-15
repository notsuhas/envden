export function terminalText(raw: string): string {
  const lines: string[][] = [[]];
  let row = 0;
  let col = 0;
  let redraw = false;
  // oxlint-disable-next-line no-control-regex -- Parse terminal escape sequences before rendering redraws.
  const tokens = raw.match(/\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]/gu) ?? [];

  for (const token of tokens) {
    if (token.startsWith("\x1b[")) {
      const n = Number(token.slice(2, -1).split(";")[0]) || 1;
      const op = token.at(-1);
      if (op === "A") row = Math.max(0, row - n);
      if (op === "B") row += n;
      if (op === "C") col += n;
      if (op === "D") col = Math.max(0, col - n);
      if (op === "G") {
        col = n - 1;
        if (col === 0) redraw = true;
      }
      if (op === "K") {
        lines[row] ??= [];
        if (token.includes("2")) lines[row] = [];
        else lines[row]!.length = Math.min(col, lines[row]!.length);
      }
      if (op === "J" && token.includes("2")) {
        lines.length = 0;
        row = 0;
        col = 0;
      }
      continue;
    }
    if (token.startsWith("\x1b")) continue;
    if (token === "\r") {
      col = 0;
      redraw = true;
      continue;
    }
    if (token === "\n") {
      row++;
      col = 0;
      redraw = false;
      continue;
    }
    if (token === "\b") {
      col = Math.max(0, col - 1);
      continue;
    }
    if (token < " " && token !== "\t") continue;
    if (redraw) {
      lines[row] = [];
      redraw = false;
    }
    lines[row] ??= [];
    lines[row]![col++] = token;
  }

  return lines
    .map((line) => line.join("").trimEnd())
    .filter((line) => !/^\s*[◒◐◓◑⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u.test(line))
    .join("\n")
    .trimEnd();
}
