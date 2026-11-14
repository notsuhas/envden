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

  test("selected entries never join adjacent assignments", () => {
    expect(clean("A=1\n", "A=1\nB=3\n", "A=2")).toBe("A=2\nB=3\n");
    expect(clean("A=1\nB=2\n", "A=1\nB=2\nC=3\n", "B=2\nA=9")).toBe("A=9\nB=2\nC=3\n");
  });

  test("concurrent appends do not duplicate a former tail", () => {
    expect(merge("A=1\n# end\n", "A=1\n# end\nL=3\n", "A=1\n# end\nN=2\n")).toEqual({
      kind: "conflict",
      reason: "layout-change",
    });
  });

  test("identical concurrent entries are clean", () => {
    expect(clean("A=1\n", "A=2\n", "A=2\n")).toBe("A=2\n");
    expect(clean("", "A=1\n", "A=1\n")).toBe("A=1\n");
    expect(clean("A=1\n", "export A=2\n", "export A=2\n")).toBe("export A=2\n");
  });

  test("two-sided independent changes preserve source lines", () => {
    for (const newline of ["\n", "\r\n"]) {
      for (const ending of ["", newline]) {
        for (let i = 0; i < 100; i++) {
          const base = `A=${i}${newline}B=${i}${newline}`;
          const local = `A=${i}${newline}B=${i + 1}${newline}`;
          const remote = `B=${i}${newline}A=${i + 2}${ending}`;
          const result = merge(base, local, remote);
          expect(result.kind).toBe("clean");
          if (result.kind !== "clean") continue;
          const lines = new Set([base, local, remote].flatMap((text) => text.split(/\r?\n/)));

          for (const line of Buffer.from(result.bytes).toString().split(/\r?\n/))
            expect(lines.has(line)).toBe(true);
        }
      }
    }
  });

  const conflicts = [
    ["duplicate-key", "A=1\nA=2\n", "B=1\n", "C=1\n"],
    ["unterminated-quote", "", "A='no", "B=1\n"],
    ["multiline-value", "", 'A="one\ntwo"\n', "B=1\n"],
    ["multiline-value", "", "A=one\\\ntwo\n", "B=1\n"],
    ["both-changed", "A=1\n", "A=2\n", "A=3\n"],
    ["delete-vs-edit", "A=1\n", "", "A=2\n"],
    ["style-change", "A=1\n", "export A=1\n", "A=2\n"],
    ["style-change", "A='1'\n", 'A="1"\n', "A='2'\n"],
    ["comment-toggle-vs-edit", "A=1\n", "# A=1\n", "A=2\n"],
    ["both-changed", "# before\nA=1\n", "# after\nA=1\n", "# before\nA=2\n"],
    ["unsupported-syntax", "", "source other.env\n", "B=1\n"],
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

test("a comment moved to different keys on both sides conflicts", () => {
  expect(
    merge("\nA=1\n# c0\nB=0\nC=1\n", "A=1\n\n# c0\nF=4\nB=0\nC=1\n", "\nA=1\nB=0\n# c0\nC=0\n"),
  ).toEqual({ kind: "conflict", reason: "layout-change" });
});

test("equality shortcuts precede parsing and style checks", () => {
  for (const changed of ['A="x\ny"\n', "A=1\nA=2\n", "\uFEFFA=2\n", "export A=2\n"]) {
    expect(clean("A=1\n", "A=1\n", changed)).toBe(changed);
    expect(clean("A=1\n", changed, "A=1\n")).toBe(changed);
    expect(clean("A=1\n", changed, changed)).toBe(changed);
  }
});

test("final line terminators do not change key selection", () => {
  expect(merge("A=1\nB=2", "A=9\nB=2", "A=1\nB=2\nC=3")).toMatchObject({
    kind: "clean",
    changedKeys: ["A", "C"],
  });

  expect(clean("A=1\nB=2", "A=5\nB=2", "A=1")).toBe("A=5\n");
});
