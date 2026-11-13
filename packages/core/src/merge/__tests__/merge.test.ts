import { describe, expect, test } from "bun:test";
import { diffEnvKeys, mergeEnv, parseEnv } from "../index.ts";

const bytes = (text: string) => Buffer.from(text);

function merge(base: string, local: string, remote: string) {
  return mergeEnv(bytes(base), bytes(local), bytes(remote));
}

function clean(base: string, local: string, remote: string): string {
  const result = merge(base, local, remote);
  expect(result.kind).toBe("clean");
  if (result.kind !== "clean") throw new Error(result.reason);

  return Buffer.from(result.bytes).toString();
}

describe("env merge", () => {
  test("raw assignments include preceding comments and preserve non-UTF8 bytes", () => {
    const input = Buffer.concat([
      bytes("# comment\r\nA="),
      Buffer.from([255]),
      bytes("\r\n\r\n# tail"),
    ]);

    const parsed = parseEnv(input);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;

    expect(Buffer.concat([...parsed.entries.map((entry) => entry.raw), parsed.tail])).toEqual(
      input,
    );
  });

  test("local layout and remote additions in remote order", () => {
    expect(clean("A=1\nB=2\n", "B=2\nA=local\n", "A=1\nB=remote\nZ=3\nC=4\n")).toBe(
      "B=remote\nA=local\nZ=3\nC=4\n",
    );
  });

  test("one-sided deletion", () =>
    expect(clean("A=1\nB=2\n", "B=2\n", "A=1\nB=3\n")).toBe("B=3\n"));

  test("both delete", () => expect(clean("A=1\n", "", "")).toBe(""));

  test("remote append after local file without newline", () =>
    expect(clean("A=1\n", "A=local", "A=1\nB=2\n")).toBe("A=local\nB=2\n"));

  const conflicts = [
    ["duplicate-key", "A=1\nA=2\n", "", ""],
    ["unterminated-quote", "", "A='no", ""],
    ["multiline-value", "", 'A="one\ntwo"\n', ""],
    ["multiline-value", "", "A=one\\\ntwo\n", ""],
    ["both-changed", "A=1\n", "A=2\n", "A=3\n"],
    ["both-changed", "", "A=1\n", "A=1\n"],
    ["delete-vs-edit", "A=1\n", "", "A=2\n"],
    ["style-change", "A=1\n", "export A=1\n", "A=1\n"],
    ["style-change", "A='1'\n", 'A="1"\n', "A='1'\n"],
    ["comment-toggle-vs-edit", "A=1\n", "# A=1\n", "A=2\n"],
    ["both-changed", "# before\nA=1\n", "# after\nA=1\n", "# before\nA=2\n"],
    ["unsupported-syntax", "", "source other.env\n", ""],
    ["layout-change", "A=1\n# old\n", "A=2\n# old\n", "A=1\n# new\n"],
  ];

  for (const [reason, base, local, remote] of conflicts)
    test(`conflict: ${reason} ${local}`, () =>
      expect(merge(base!, local!, remote!)).toMatchObject({ kind: "conflict", reason }));

  test("diff returns names only", () =>
    expect(diffEnvKeys(bytes("A=secret\nB=old\n"), bytes("A=newsecret\nC=hidden\n"))).toEqual({
      kind: "diff",
      added: ["C"],
      removed: ["B"],
      changed: ["A"],
    }));

  test("seeded one-sided changes reproduce bytes in either direction", () => {
    let seed = 173;

    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed;
    }

    for (let i = 0; i < 300; i++) {
      const newline = random() % 2 ? "\n" : "\r\n";

      const rows = Array.from(
        { length: (random() % 10) + 1 },
        (_, n) => `# comment ${n}${newline}KEY_${n}='${random()}'${newline}`,
      );

      const base = rows.join("");
      rows.splice(random() % rows.length, 1);
      rows.reverse();
      rows.push(`ADDED=${random()}${newline}# tail ${random()}`);
      const changed = rows.join("");
      expect(clean(base, changed, base)).toBe(changed);
      expect(clean(base, base, changed)).toBe(changed);
    }
  });
});
