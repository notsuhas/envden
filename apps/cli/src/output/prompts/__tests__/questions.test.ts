import { expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { confirm, isCancel, password, select, text } from "@clack/prompts";
import "../questions.ts";

// clack waited forever once readline closed on Ctrl-D; envden binds it to cancel like Ctrl-C
for (const [name, ask] of [
  ["text", (io: object) => text({ message: "Name", ...io })],
  ["password", (io: object) => password({ message: "Password", ...io })],
  ["confirm", (io: object) => confirm({ message: "Sure?", ...io })],
  ["select", (io: object) => select({ message: "Pick", options: [{ value: "a" }], ...io })],
] as const)
  test(`Ctrl-D cancels a ${name} prompt`, async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();

    const answer = ask({ input, output });
    input.write("\x04");

    expect(isCancel(await answer)).toBe(true);
  });
