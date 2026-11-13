import { cellNoise } from "@/components/landing/art/dither/noise.ts";
import { WORDMARK_ROWS, wordmarkBitmap } from "@/components/landing/chrome/wordmark/bitmap.ts";

const BITMAP = wordmarkBitmap("envden");
const BITMAP_COLUMNS = BITMAP[0]?.length ?? 0;
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_=#";
const SCRAMBLE_ODDS = 0.025;
const SCRAMBLE_SECONDS = 0.45;

const INK = "rgba(237, 233, 224, 0.9)";
const LANTERN = "rgba(247, 190, 84, 1)";
const GROUND = "rgba(12, 12, 11, 1)";

export interface IWordmarkGrid {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  block: number;
  stacked: boolean;
}

export function wordmarkGrid(width: number): IWordmarkGrid {
  const stacked = width < 420;
  const block = width > 720 ? 3 : 2;
  const columns = (stacked ? 17 : BITMAP_COLUMNS) * block;
  const cellWidth = width / columns;

  return {
    columns,
    rows: (stacked ? WORDMARK_ROWS * 2 + 1 : WORDMARK_ROWS) * block,
    cellWidth,
    cellHeight: cellWidth * 1.7,
    block,
    stacked,
  };
}

function inked(grid: IWordmarkGrid, row: number, column: number): boolean {
  const bitmapRow = Math.floor(row / grid.block);
  const lower = grid.stacked && bitmapRow > WORDMARK_ROWS;
  const sourceRow = lower ? bitmapRow - WORDMARK_ROWS - 1 : bitmapRow;
  const sourceColumn = Math.floor(column / grid.block) + (lower ? 18 : 0);

  return BITMAP[sourceRow]?.charAt(sourceColumn) === "#";
}

function glyphAt(row: number, column: number, epoch: number): string {
  return GLYPHS.charAt(Math.floor(cellNoise(row, column, epoch) * GLYPHS.length));
}

function setFont(context: CanvasRenderingContext2D, grid: IWordmarkGrid, family: string): void {
  context.font = `${Math.max(7, grid.cellWidth * 1.25)}px ${family}`;
  context.textBaseline = "top";
}

// the settled word, drawn once and reused as the backdrop for every frame
export function drawSettled(
  context: CanvasRenderingContext2D,
  grid: IWordmarkGrid,
  family: string,
) {
  setFont(context, grid, family);
  context.fillStyle = INK;

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      if (!inked(grid, row, column)) continue;

      context.fillText(glyphAt(row, column, 0), column * grid.cellWidth, row * grid.cellHeight);
    }
  }
}

// only the few cells that are mid-scramble this beat get repainted
export function drawScramble(
  context: CanvasRenderingContext2D,
  grid: IWordmarkGrid,
  family: string,
  seconds: number,
): void {
  const beat = Math.floor(seconds / SCRAMBLE_SECONDS);

  setFont(context, grid, family);

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const resolving = resolvingCell(seconds, column, grid.columns);
      if (skipCell(resolving, row, column, beat)) continue;

      paintScrambleCell(context, grid, row, column, beat + Math.floor(seconds * 12));
    }
  }
}

function paintScrambleCell(
  context: CanvasRenderingContext2D,
  grid: IWordmarkGrid,
  row: number,
  column: number,
  epoch: number,
): void {
  const x = column * grid.cellWidth;
  const y = row * grid.cellHeight;

  context.fillStyle = GROUND;
  context.fillRect(x, y, grid.cellWidth, grid.cellHeight);
  context.fillStyle = inked(grid, row, column) ? LANTERN : "rgba(237,233,224,0.3)";
  context.fillText(glyphAt(row, column, epoch), x, y);
}

function resolvingCell(seconds: number, column: number, columns: number): boolean {
  return seconds < 0.9 && column / columns > seconds / 0.9;
}

function skipCell(resolving: boolean, row: number, column: number, beat: number): boolean {
  return !resolving && cellNoise(row, column, beat + 7) > SCRAMBLE_ODDS;
}
