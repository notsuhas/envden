import { expect, test } from "bun:test";
import { deriveFileContent, deriveFileDecision } from "../file-decision.ts";

const content = ["base", "X", "Y", undefined].map((value) =>
  value === undefined ? undefined : new TextEncoder().encode(value),
);

const roles = ["copy", "untracked-copy", "link", "untracked-link", "historical-link"] as const;

const targets = roles.flatMap((role) =>
  content.flatMap((bytes) =>
    content.map((base) => ({
      bytes,
      base,
      tracked: !role.startsWith("untracked"),
      mode: role.includes("copy") ? ("copy" as const) : ("link" as const),
      detached: role === "link",
      historical: role === "historical-link",
    })),
  ),
);

test("exhaustive target trust and remote decisions (409600 combinations)", () => {
  let count = 0;

  for (const store of content)
    for (const first of targets)
      for (const second of targets) count += verifyRemotes(store, [first, second]);

  expect(count).toBe(409600);
});

function expectedLocal(store: (typeof content)[number], copies: typeof targets) {
  const opinions = copies.map((target) => targetOpinion(store, target));

  const candidates = new Set(
    opinions.flatMap((opinion) => (opinion.kind === "edit" ? [opinion.bytes] : [])),
  );

  if (opinions.some((opinion) => opinion.kind === "unsafe") || candidates.size > 1)
    return { kind: "conflict" } as const;

  return { kind: "content", bytes: candidates.size ? [...candidates][0] : store } as const;
}

function targetOpinion(store: (typeof content)[number], target: (typeof targets)[number]) {
  if (target.bytes === undefined || target.bytes === store || target.historical)
    return { kind: "unchanged" } as const;

  if (target.mode !== "copy" || !target.tracked || target.base === undefined)
    return { kind: "unsafe" } as const;

  if (target.bytes === target.base) return { kind: "unchanged" } as const;

  return store === target.base
    ? ({ kind: "edit", bytes: target.bytes } as const)
    : ({ kind: "unsafe" } as const);
}

function verifyRemotes(store: (typeof content)[number], copies: typeof targets) {
  const expected = expectedLocal(store, copies);

  for (const server of content)
    for (const published of [false, true])
      for (const choosing of [false, true]) {
        const result = deriveFileDecision({
          store,
          copies,
          tracked: true,
          server,
          previous: content[0],
          published,
          choosing,
          repair: false,
        });

        verifyResult(result, expected);
      }

  return 16;
}

test("unknown bytes cannot win even with an absent store", () => {
  expect(
    deriveFileContent(undefined, [
      { bytes: content[1], base: undefined, tracked: false, detached: false, mode: "copy" },
    ]).kind,
  ).toBe("conflict");
});

function verifyResult(
  result: ReturnType<typeof deriveFileDecision>,
  expected: ReturnType<typeof expectedLocal>,
) {
  if (expected.kind === "conflict") {
    expect(result.local.kind).toBe("conflict");
    expect(result.action.kind).toBe("conflict");
  } else {
    expect(result.local.kind).toBe("content");
    if (result.local.kind === "content") expect(result.local.bytes).toEqual(expected.bytes);
  }
}
