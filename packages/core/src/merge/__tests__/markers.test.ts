import { expect, test } from "bun:test";
import { hasConflictMarkers, markConflicts } from "../index.ts";

const bytes = (text: string) => Buffer.from(text);
const labels = { mine: "this device", theirs: "server (from laptop)" };

function marked(base: string | undefined, local: string, remote: string) {
  const result = markConflicts(
    base === undefined ? undefined : bytes(base),
    bytes(local),
    bytes(remote),
    labels,
  );

  return { ...result, text: Buffer.from(result.bytes).toString() };
}

test("a key changed on both sides is marked alone and the rest merges", () => {
  const result = marked(
    "API_URL=a\nTOKEN=1\n",
    "API_URL=b\nTOKEN=2\n",
    "API_URL=a\nTOKEN=3\nNEW=1\n",
  );

  expect(result.kind === "keys" && result.keys).toEqual(["TOKEN"]);

  expect(result.text).toBe(
    "API_URL=b\n<<<<<<< this device\nTOKEN=2\n=======\nTOKEN=3\n>>>>>>> server (from laptop)\nNEW=1\n",
  );
});

test("a key deleted on one side keeps an empty side in its block", () => {
  expect(marked("A=1\nB=1\n", "A=1\n", "A=1\nB=2\n").text).toBe(
    "A=1\n<<<<<<< this device\n=======\nB=2\n>>>>>>> server (from laptop)\n",
  );
});

test("without a base or a parse, the whole file is one block", () => {
  for (const [base, local, remote] of [
    [undefined, "A=1", "A=2\n"],
    ["A=1\n", "A='open\n", "A=2\n"],
  ] as const)
    expect(marked(base, local, remote)).toMatchObject({
      kind: "file",
      text: `<<<<<<< this device\n${local.endsWith("\n") ? local : `${local}\n`}=======\n${remote}>>>>>>> server (from laptop)\n`,
    });
});

test("marker detection finds only whole marker lines", () => {
  expect(hasConflictMarkers(marked(undefined, "A=1\n", "A=2\n").bytes)).toBe(true);
  expect(hasConflictMarkers(bytes("A=<<<<<<< x\nB=======\n"))).toBe(false);
});
