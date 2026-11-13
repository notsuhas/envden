import { expect, test } from "bun:test";

import { runFixture } from "./utils.ts";

test("tests require __tests__ as their direct parent", () => {
  expect(
    runFixture("tests-in-tests-folder", {
      "__tests__/valid.test.ts": "",
      "__tests__/valid.test.tsx": "",
    }).diagnostics,
  ).toHaveLength(0);

  expect(
    runFixture("tests-in-tests-folder", { "bad.test.ts": "", "__tests__/nested/bad.test.tsx": "" })
      .diagnostics,
  ).toHaveLength(2);
});

test("index files contain only source re-exports", () => {
  expect(
    runFixture("index-reexports-only", {
      "index.ts":
        'export { foo } from "./foo.ts";\nexport type { TBar } from "./bar.ts";\nexport * from "./baz.ts";\nexport type * from "./types.ts";',
    }).diagnostics,
  ).toHaveLength(0);

  expect(
    runFixture("index-reexports-only", {
      "index.tsx":
        'import "./foo.ts";\nconst foo = 1;\nexport { foo };\nexport default foo;\nexport interface IFoo {}\nexport type TFoo = string;',
    }).diagnostics,
  ).toHaveLength(6);

  expect(
    runFixture("index-reexports-only", { "other.ts": "export const foo = 1;" }).diagnostics,
  ).toHaveLength(0);
});

test("interface names and exported type names follow the prefix convention", () => {
  expect(
    runFixture("type-name-prefix", {
      "valid.ts":
        "interface IFoo {}\nexport interface IBar {}\nexport type TFoo = string;\ntype Local = number;",
    }).diagnostics,
  ).toHaveLength(0);

  expect(
    runFixture("type-name-prefix", {
      "bad.ts":
        "interface Foo {}\ninterface Ifoo {}\ninterface IFooProps {}\nexport type Bad = string;\nexport type Tbad = string;\ntype Other = number;\nexport type { Other };",
    }).diagnostics,
  ).toHaveLength(6);
});

test("comments have one physical line, including consecutive line comments", () => {
  expect(
    runFixture("max-comment-lines", {
      "valid.ts":
        "/* copyright envden\n * SPDX-License-Identifier: MIT\n */\nconst a = 1;\n// one reason\nconst b = 2;\n// @ts-expect-error -- fixture reason\n// oxlint-disable-next-line no-console -- fixture reason\nconsole.log(a, b);",
    }).diagnostics,
  ).toHaveLength(0);

  expect(
    runFixture("max-comment-lines", {
      "bad.ts":
        "// first\n// second\nconst a = 1;\n/** docs\n * more docs\n */\nconst b = 2;\n/* copyright\n * not a header\n */\nconst c = 3;",
    }).diagnostics,
  ).toHaveLength(3);

  expect(
    runFixture("max-comment-lines", {
      "bad.ts": "// one\n// @ts-expect-error -- fixture reason\n// another\nconst x = 1;",
    }).diagnostics,
  ).toHaveLength(0);
});

test("folders allow eight sources, ignoring tests, index and nested files", () => {
  const files = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [`file${index}.ts`, "export {};"]),
  );

  expect(
    runFixture("folder-size", {
      ...files,
      "index.ts": "",
      "extra.test.ts": "",
      "__tests__/fixture.ts": "",
      "nested/child.ts": "",
    }).diagnostics,
  ).toHaveLength(0);

  const result = runFixture("folder-size", { ...files, "ninth.ts": "" });
  expect(result.diagnostics).toHaveLength(1);
  expect(JSON.stringify(result.diagnostics)).toContain("file0.ts");
});

test("shared filename prefixes suggest a folder", () => {
  expect(
    runFixture("no-group-prefix-filenames", {
      "device-add.ts": "",
      "server-ls.ts": "",
      "nested/device-ls.ts": "",
    }).diagnostics,
  ).toHaveLength(0);

  expect(
    runFixture("no-group-prefix-filenames", { "device-add.ts": "", "device-ls.ts": "" })
      .diagnostics,
  ).toHaveLength(2);

  expect(
    runFixture("no-group-prefix-filenames", {
      "device-add.ts": "",
      "device-add.test.ts": "",
      "__tests__/device-ls.ts": "",
    }).diagnostics,
  ).toHaveLength(0);
});
