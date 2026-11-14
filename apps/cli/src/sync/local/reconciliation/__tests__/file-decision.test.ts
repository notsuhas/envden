import { expect, test } from "bun:test";
import { deriveFileContent, deriveFileDecision } from "../file-decision.ts";

const content = ["base", "X", "Y", undefined].map((item) =>
  item === undefined ? undefined : new TextEncoder().encode(item),
);

for (const store of content)
  for (const first of content)
    for (const second of content)
      test(`shared store decisions ${store?.[0]} ${first?.[0]} ${second?.[0]}`, () => {
        const result = deriveFileContent(
          store,
          [first, second].map((bytes) => ({
            bytes,
            base: content[0],
            tracked: true,
            detached: false,
          })),
        );

        const edits = [store, first, second].filter((bytes) => bytes !== content[0]);
        const distinct = new Set(edits);

        if (distinct.size > 1) expect(result.kind).toBe("conflict");
        else {
          expect(result.kind).toBe("content");

          if (result.kind === "content")
            expect(result.bytes).toEqual(edits.length ? edits[0] : content[0]);
        }
      });

test("shared-file decisions retain local edits and gate remote deletion", () => {
  const input = {
    store: content[1],
    copies: [],
    tracked: true,
    published: true,
    previous: content[0],
    server: content[0],
    choosing: false,
    repair: false,
  };

  expect(deriveFileDecision(input).action).toEqual({ kind: "write", next: content[1] });
  expect(deriveFileDecision({ ...input, server: content[2] }).action.kind).toBe("choose");

  expect(deriveFileDecision({ ...input, server: undefined, tombstone: true }).action.kind).toBe(
    "choose",
  );
});

test("a detached link records the checkout edit as mine", () => {
  const result = deriveFileContent(content[0], [
    { bytes: content[1], base: undefined, tracked: true, detached: true },
  ]);

  expect(result).toEqual({ kind: "conflict", mine: content[1], theirs: content[0] });
});
