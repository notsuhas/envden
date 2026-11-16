import { expect, test } from "bun:test";
import { assignments } from "../cli/assignments.ts";
import { parseRunOptions } from "../cli/options.ts";

const absolute = (path: string) => `/abs/${path}`;

test("run options follow the harness contract", () => {
  expect(
    parseRunOptions(
      [
        "--reference",
        "ts",
        "--candidate",
        "go",
        "--scenario",
        "help",
        "--scenario",
        "sync",
        "--keep",
      ],
      absolute,
    ),
  ).toEqual({
    reference: "/abs/ts",
    candidate: "/abs/go",
    scenarios: ["help", "sync"],
    keep: true,
    mix: false,
  });

  expect(
    parseRunOptions(["--reference", "ts", "--candidate", "go", "--mix", "--third", "rs"], absolute)
      .third,
  ).toBe("/abs/rs");

  for (const args of [
    ["--candidate", "go"],
    ["--reference", "ts", "--candidate"],
    ["--reference", "ts", "--candidate", "go", "--impl", "x"],
    ["--reference", "ts", "--candidate", "go", "--third", "rs"],
  ])
    expect(() => parseRunOptions(args, absolute)).toThrow();
});

const binaries = { reference: "ts", candidate: "go", third: "rs" };

test("a plain run puts the candidate in every role", () => {
  expect(assignments(["server", "a"], binaries, false)).toEqual([
    { name: "candidate", roles: { server: "go", a: "go" } },
  ]);
});

test("mixes cover server, device and mixed-vault roles without repeats", () => {
  const roles = (names: string[]) =>
    assignments(["server", "a", "b"], { ...binaries, third: undefined } as never, true)
      .filter((mix) => names.includes(mix.name))
      .map((mix) => mix.roles);

  expect(roles(["candidate servers", "candidate devices", "candidate a", "candidate b"])).toEqual([
    { server: "go", a: "ts", b: "ts" },
    { server: "ts", a: "go", b: "go" },
    { server: "ts", a: "go", b: "ts" },
    { server: "ts", a: "ts", b: "go" },
  ]);

  expect(assignments(["server", "a"], binaries, true).map((mix) => mix.name)).toEqual([
    "candidate servers",
    "candidate devices",
  ]);
});

test("a third implementation shares a vault with the reference and candidate", () => {
  const mixes = assignments(["server", "a", "b", "c"], binaries, true);

  expect(mixes.find((mix) => mix.name === "reference, candidate and third devices")?.roles).toEqual(
    {
      server: "ts",
      a: "ts",
      b: "go",
      c: "rs",
    },
  );

  expect(mixes.find((mix) => mix.name === "third servers")?.roles).toEqual({
    server: "rs",
    a: "ts",
    b: "go",
    c: "go",
  });

  expect(assignments(["server", "a"], { reference: "ts", candidate: "ts" }, true)).toEqual([]);
});
