import { expect, spyOn, test } from "bun:test";
import * as questions from "../questions.ts";
import { askDeviceName } from "../device-name.ts";

test("--name wins, a terminal edits the host suggestion, and scripts take it as is", async () => {
  const input = spyOn(questions, "input").mockResolvedValue("edited");

  try {
    expect(await askDeviceName("given", "laptop.local", true)).toBe("given");
    expect(await askDeviceName(undefined, "laptop.local", false)).toBe("laptop");
    expect(await askDeviceName(undefined, "laptop.local", true)).toBe("edited");
    expect(input.mock.calls).toEqual([["Device name", true, "laptop", expect.any(Function)]]);
  } finally {
    input.mockRestore();
  }
});

test("a name with a control or invisible character fails before anything is signed", async () => {
  const input = spyOn(questions, "input").mockResolvedValue("edited");

  try {
    for (const name of ["a\nb", "a\tb", "\x1b[2Jb", "a\u200Bb", ""])
      await Promise.resolve(
        expect(askDeviceName(name, "laptop.local", true)).rejects.toMatchObject({
          code: "INVALID_INPUT",
          message: "Device names are 1-64 bytes with no invisible characters",
        }),
      );

    await askDeviceName(undefined, "laptop.local", true);
    const check = input.mock.calls[0]![3]!;

    expect(check("a\nb")).toBe("Device names are 1-64 bytes with no invisible characters");
    expect(check("ab")).toBeUndefined();
  } finally {
    input.mockRestore();
  }
});
