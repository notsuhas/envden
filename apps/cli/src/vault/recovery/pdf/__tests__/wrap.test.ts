import { expect, test } from "bun:test";
import { wrapText } from "../wrap.ts";

test("words wrap at spaces and a word wider than the column breaks between characters", () => {
  const measure = (part: string) => part.length;

  expect(wrapText("run envden join https://abcdefghijklmnopqrstuvwxyz now", 10, measure)).toEqual([
    "run",
    "envden",
    "join",
    "https://ab",
    "cdefghijkl",
    "mnopqrstuv",
    "wxyz",
    "now",
  ]);
});
