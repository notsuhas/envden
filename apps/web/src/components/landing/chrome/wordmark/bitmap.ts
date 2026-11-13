const LETTERS: Record<string, string[]> = {
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
};

export const WORDMARK_ROWS = 7;

// one string per row, "#" where a letter has ink, letters separated by one blank column
export function wordmarkBitmap(word: string): string[] {
  return Array.from({ length: WORDMARK_ROWS }, (_, row) =>
    Array.from(word, (letter) => LETTERS[letter]?.[row] ?? ".....").join("."),
  );
}
