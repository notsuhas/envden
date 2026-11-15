import { expect, spyOn, test } from "bun:test";
import * as questions from "../questions.ts";
import { askDeviceName } from "../device-name.ts";

test("--name wins, a terminal edits the host suggestion, and scripts take it as is", async () => {
  const input = spyOn(questions, "input").mockResolvedValue("edited");

  try {
    expect(await askDeviceName("given", "laptop.local", true)).toBe("given");
    expect(await askDeviceName(undefined, "laptop.local", false)).toBe("laptop");
    expect(await askDeviceName(undefined, "laptop.local", true)).toBe("edited");
    expect(input.mock.calls).toEqual([["Device name", true, "laptop"]]);
  } finally {
    input.mockRestore();
  }
});
