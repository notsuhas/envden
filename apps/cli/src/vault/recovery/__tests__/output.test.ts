import { test, expect, spyOn } from "bun:test";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { writeRecoveryCode } from "../output.ts";
import { recoveryCodeOutput, requireCodeOutput } from "../show.ts";

const code = p.encodeRecoveryCode(new Uint8Array(16));

test("a recovery code file is private, never overwritten, and decodes back", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-code-"));
  const path = join(root, "code.txt");

  try {
    await writeRecoveryCode(path, code);
    expect(p.decodeRecoveryCode(await readFile(path, "utf8"))).toEqual(new Uint8Array(16));
    expect((await stat(path)).mode & 0o777).toBe(0o600);

    for (const target of [path, join(root, "missing", "code.txt")])
      await Promise.resolve(
        expect(writeRecoveryCode(target, code)).rejects.toMatchObject({ code: "INVALID_INPUT" }),
      );

    expect(await readFile(path, "utf8")).toBe(`${code}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the code is shown once with one confirm, and refused where only an agent would see it", async () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const questions: string[] = [];

  try {
    expect(() => requireCodeOutput({ terminal: false })).toThrow("needs a terminal");
    const stdout = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    const stdin = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

    try {
      Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
      expect(() => requireCodeOutput({})).toThrow("needs a terminal");
    } finally {
      for (const [stream, saved] of [
        [process.stdout, stdout],
        [process.stdin, stdin],
      ] as const)
        if (saved) Object.defineProperty(stream, "isTTY", saved);
        else Reflect.deleteProperty(stream, "isTTY");
    }

    expect(() => requireCodeOutput({ terminal: false, path: "/tmp/x" })).not.toThrow();

    const ask = (message: string) => {
      questions.push(message);

      return Promise.resolve(false);
    };

    await recoveryCodeOutput({ terminal: true, ask }).show(code);
    const printed = log.mock.calls.map((call) => String(call[0])).join("\n");

    expect(printed).toContain(code);
    expect(printed).toContain("password manager");
    expect(printed).toContain("envden vault recovery-code");
    expect(questions).toEqual(["Stored it?"]);
  } finally {
    log.mockRestore();
  }
});
