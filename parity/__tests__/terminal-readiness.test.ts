import { choiceExpression } from "../runtime/process/choice.ts";
import { expect, spyOn, test } from "bun:test";
import { Terminal } from "../runtime/process/terminal.ts";

test.each([
  ["zsh", "bash"],
  ["Yes", "No"],
])("selector waits for delayed %s/%s choices", async (first, second) => {
  const writes: string[] = [];
  let receive = (_terminal: unknown, _bytes: Uint8Array) => {};

  const child = {
    exitCode: null,
    exited: new Promise<number>(() => {}),
    terminal: { write: (value: string) => writes.push(value), close: () => {} },
  };

  const spawn = spyOn(Bun, "spawn").mockImplementation(((
    _argv: unknown,
    options?: { terminal?: unknown },
  ) => {
    receive = (options!.terminal as { data: typeof receive }).data;

    return child;
  }) as unknown as typeof Bun.spawn);

  try {
    const terminal = new Terminal({ argv: ["fixture"], env: {}, cwd: "/tmp" });
    const answer = { expect: "Install the shell notice", send: "\r", choices: [first, second] };
    receive(undefined, new TextEncoder().encode("Install the shell notice?\nNo matching now\n"));
    const answering = terminal.answers([answer]);
    await Promise.resolve();
    expect(writes).toEqual([]);
    receive(undefined, new TextEncoder().encode(`● ${first}\n`));
    await new Promise<void>(setImmediate);
    expect(writes).toEqual([]);
    receive(undefined, new TextEncoder().encode(`○ ${second}\n`));
    await answering;
    expect(writes).toEqual(["\r"]);
  } finally {
    spawn.mockRestore();
  }
});

test("confirmation readiness accepts Go horizontal labels without matching title prose", () => {
  for (const choice of ["Yes", "No"]) {
    expect(choiceExpression(choice).test("┃                            Yes     No")).toBe(true);
    expect(choiceExpression(choice).test("Open it now?")).toBe(false);
    expect(choiceExpression(choice).test("No matching now")).toBe(false);
  }
});
