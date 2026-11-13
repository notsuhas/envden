import { test, expect } from "bun:test";
import type { ESTree } from "vite-plus/lint/plugins";
import { checkIndexProgram as checkIndex } from "../index-reexports-only.ts";
import { collectExportNames as checkNames } from "../type-name-prefix.ts";
import { checkCommentProgram as checkComments } from "../max-comment-lines.ts";
import { checkFilenameProgram as checkFilename } from "../no-group-prefix-filenames.ts";

test("index visitor accepts re-exports and rejects logic", () => {
  const reports: unknown[] = [];

  const context = {
    filename: "/tmp/index.ts",
    report: (report: unknown) => reports.push(report),
  } as Parameters<typeof checkIndex>[0];

  const node = {
    body: [{ type: "ExportAllDeclaration" }, { type: "VariableDeclaration" }],
  } as ESTree.Program;

  checkIndex(context, node);
  expect(reports).toHaveLength(1);
});

test("export collector records only local identifier exports", () => {
  const names = new Set<string>();

  const node = {
    body: [
      {
        type: "ExportNamedDeclaration",
        source: null,
        specifiers: [{ local: { type: "Identifier", name: "TFoo" } }],
      },
    ],
  } as ESTree.Program;

  checkNames({} as Parameters<typeof checkNames>[0], node, names);
  expect([...names]).toEqual(["TFoo"]);
});

test("comment visitor rejects a multiline comment", () => {
  const reports: unknown[] = [];

  const comment = {
    type: "Block",
    value: " explanation ",
    range: [0, 20],
    loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 2 } },
  };

  const context = {
    sourceCode: { getAllComments: () => [comment], text: "/* explanation */" },
    report: (report: unknown) => reports.push(report),
  } as unknown as Parameters<typeof checkComments>[0];

  checkComments(context, { body: [] } as unknown as ESTree.Program);
  expect(reports).toHaveLength(1);
});

test.each(["file.ts", "file.test.ts", "/tmp/__tests__/some-file.ts", "use-value.ts"])(
  "filename visitor permits %s",
  (filename) => {
    const reports: unknown[] = [];

    checkFilename(
      { filename, report: (report: unknown) => reports.push(report) } as Parameters<
        typeof checkFilename
      >[0],
      {} as ESTree.Program,
    );

    expect(reports).toHaveLength(0);
  },
);
