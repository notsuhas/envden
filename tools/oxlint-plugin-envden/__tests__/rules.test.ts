import { expect, test } from "bun:test";

import { diagnosticsFor, runFixture } from "./utils.ts";

test("tests require __tests__ as their direct parent", () => {
  const { diagnostics } = runFixture("tests-in-tests-folder", {
    "__tests__/valid.test.ts": "",
    "__tests__/valid.test.tsx": "",
    "bad.test.ts": "",
    "__tests__/nested/bad.test.tsx": "",
  });

  expect(diagnosticsFor(diagnostics, "__tests__/valid.test.ts")).toHaveLength(0);
  expect(diagnosticsFor(diagnostics, "__tests__/valid.test.tsx")).toHaveLength(0);
  expect(diagnostics).toHaveLength(2);
});

test("index files contain only source re-exports", () => {
  const { diagnostics } = runFixture("index-reexports-only", {
    "valid/index.ts":
      'export { foo } from "./foo.ts";\nexport type { TBar } from "./bar.ts";\nexport * from "./baz.ts";\nexport type * from "./types.ts";',
    "bad/index.tsx":
      'import "./foo.ts";\nconst foo = 1;\nexport { foo };\nexport default foo;\nexport interface IFoo {}\nexport type TFoo = string;',
    "other/other.ts": "export const foo = 1;",
  });

  expect(diagnosticsFor(diagnostics, "bad/index.tsx")).toMatchObject(
    [1, 2, 3, 4, 5, 6].map((line) => ({
      code: "envden(index-reexports-only)",
      labels: [{ span: { line } }],
    })),
  );

  expect(diagnostics).toHaveLength(6);
});

test("interface names and exported type names follow the prefix convention", () => {
  const { diagnostics } = runFixture("type-name-prefix", {
    "valid.ts":
      "interface IFoo {}\nexport interface IBar {}\nexport type TFoo = string;\ntype Local = number;",
    "bad.ts":
      "interface Foo {}\ninterface Ifoo {}\ninterface IFooProps {}\nexport type Bad = string;\nexport type Tbad = string;\ntype Other = number;\nexport type { Other };",
  });

  expect(diagnosticsFor(diagnostics, "valid.ts")).toHaveLength(0);

  expect(diagnosticsFor(diagnostics, "bad.ts")).toMatchObject(
    [1, 2, 3, 4, 5, 6].map((line) => ({
      code: "envden(type-name-prefix)",
      labels: [{ span: { line } }],
    })),
  );
});

test("comments have one physical line, including consecutive line comments", () => {
  const { diagnostics } = runFixture("max-comment-lines", {
    "valid.ts":
      "/* copyright envden\n * SPDX-License-Identifier: MIT\n */\nconst a = 1;\n// one reason\nconst b = 2;\n// @ts-expect-error -- fixture reason\n// oxlint-disable-next-line no-console -- fixture reason\nconsole.log(a, b);",
    "bad.ts":
      "// first\n// second\nconst a = 1;\n/** docs\n * more docs\n */\nconst b = 2;\n/* copyright\n * not a header\n */\nconst c = 3;",
    "directive.ts": "// one\n// @ts-expect-error -- fixture reason\n// another\nconst x = 1;",
  });

  expect(diagnosticsFor(diagnostics, "bad.ts")).toHaveLength(3);
  expect(diagnostics).toHaveLength(3);
});

test("folders allow eight sources, ignoring tests, index and nested files", () => {
  const sources = (folder: string) =>
    Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`${folder}/file${index}.ts`, "export {};"]),
    );

  const { diagnostics } = runFixture("folder-size", {
    ...sources("full"),
    "full/index.ts": "",
    "full/extra.test.ts": "",
    "full/__tests__/fixture.ts": "",
    "full/nested/child.ts": "",
    ...sources("over"),
    "over/ninth.ts": "",
  });

  expect(diagnosticsFor(diagnostics, "over/file0.ts")).toHaveLength(1);
  expect(diagnostics).toHaveLength(1);
});

test("shared filename prefixes suggest a folder", () => {
  const { diagnostics } = runFixture("no-group-prefix-filenames", {
    "spread/device-add.ts": "",
    "spread/server-ls.ts": "",
    "spread/nested/device-ls.ts": "",
    "grouped/device-add.ts": "",
    "grouped/device-ls.ts": "",
    "tests/device-add.ts": "",
    "tests/device-add.test.ts": "",
    "tests/__tests__/device-ls.ts": "",
  });

  expect(diagnosticsFor(diagnostics, "grouped/device-add.ts")).toHaveLength(1);
  expect(diagnosticsFor(diagnostics, "grouped/device-ls.ts")).toHaveLength(1);
  expect(diagnostics).toHaveLength(2);
});
