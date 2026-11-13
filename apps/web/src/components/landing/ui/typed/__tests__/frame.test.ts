import { describe, expect, test } from "bun:test";
import { sessionFrame, sessionTicks } from "../frame.ts";
import type { ISessionLine } from "../frame.ts";

const LINES: ISessionLine[] = [
  { kind: "command", text: "envden pull" },
  { kind: "output", text: "done" },
];

describe("sessionFrame", () => {
  test("starts empty", () => {
    expect(sessionFrame(LINES, 0)).toEqual({ lines: [], typing: false });
  });

  test("types a command one character per tick", () => {
    expect(sessionFrame(LINES, 4)).toEqual({
      lines: [{ kind: "command", text: "envd" }],
      typing: true,
    });
  });

  test("shows output only after the command has been typed and has rested", () => {
    expect(sessionFrame(LINES, 11).lines).toHaveLength(1);
    expect(sessionFrame(LINES, 18).lines).toEqual(LINES);
  });

  test("the whole session fits inside its tick count", () => {
    expect(sessionFrame(LINES, sessionTicks(LINES))).toEqual({ lines: LINES, typing: false });
  });
});
