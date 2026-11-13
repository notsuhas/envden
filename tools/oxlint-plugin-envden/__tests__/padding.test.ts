import { expect, test } from "bun:test";

import { runFixture } from "./utils.ts";

const source = [
  'import { readFileSync } from "node:fs";',
  'import { join } from "node:path";',
  "const a = 1;",
  "const b = 2;",
  "function run() {",
  "  const value = readFileSync(",
  '    join("a", "b"),',
  "  );",
  "  // The caller owns decoding.",
  "  return value;",
  "}",
  "class Example {",
  "  a = 1;",
  "  b = 2;",
  "  run() {",
  "    const result = run();",
  "    return result;",
  "  }",
  "  next() {}",
  "}",
  "",
].join("\n");

const fixed = [
  'import { readFileSync } from "node:fs";',
  'import { join } from "node:path";',
  "",
  "const a = 1;",
  "const b = 2;",
  "",
  "function run() {",
  "  const value = readFileSync(",
  '    join("a", "b"),',
  "  );",
  "",
  "  // The caller owns decoding.",
  "  return value;",
  "}",
  "",
  "class Example {",
  "  a = 1;",
  "  b = 2;",
  "",
  "  run() {",
  "    const result = run();",
  "",
  "    return result;",
  "  }",
  "",
  "  next() {}",
  "}",
  "",
].join("\n");

test("padding reports missing boundaries and fixes comments with their statements", () => {
  expect(runFixture("padding-lines", { "source.ts": source }).diagnostics).toHaveLength(7);
  const result = runFixture("padding-lines", { "source.ts": source }, true);
  expect(result.files["source.ts"]).toBe(fixed);
  expect(result.diagnostics).toHaveLength(0);
  expect(runFixture("padding-lines", { "source.ts": fixed }, true).files["source.ts"]).toBe(fixed);
});

test("padding allows single-line groups and already padded declarations", () => {
  const source =
    'const a = 1;\nconst b = 2;\n\nexport { a };\nexport { b };\n\nexport type { TFoo } from "./foo.ts";\nexport type { TBar } from "./bar.ts";\n\nfunction f() {\n  setup();\n  work();\n\n  return a;\n}\n';

  expect(runFixture("padding-lines", { "source.ts": source }).diagnostics).toHaveLength(0);
});

test("padding surrounds multiline function statements, including nested blocks", () => {
  const source =
    "function f() {\n  setup();\n  if (ready) {\n    work();\n    return done;\n  }\n  finish();\n}\n";

  const expected =
    "function f() {\n  setup();\n\n  if (ready) {\n    work();\n\n    return done;\n  }\n\n  finish();\n}\n";

  expect(runFixture("padding-lines", { "source.ts": source }, true).files["source.ts"]).toBe(
    expected,
  );
});

test("padding preserves trailing comments, CRLF, and existing extra blank lines", () => {
  const source = "let a = 1; // trailing\r\n// attached\r\nlet b = 2;\r\n\r\n\r\nlet c = 3;\r\n";

  const expected =
    "let a = 1; // trailing\r\n\r\n// attached\r\nlet b = 2;\r\n\r\n\r\nlet c = 3;\r\n";

  expect(runFixture("padding-lines", { "source.ts": source }, true).files["source.ts"]).toBe(
    expected,
  );
});

test("padding inserts one newline per fix, even for same-line declarations", () => {
  const first = runFixture("padding-lines", { "source.ts": "let a = 1; let b = 2;" }, true).files[
    "source.ts"
  ]!;

  expect(first).toBe("let a = 1;\n let b = 2;");
  const second = runFixture("padding-lines", { "source.ts": first }, true).files["source.ts"]!;
  expect(second).toBe("let a = 1;\n\n let b = 2;");
  expect(runFixture("padding-lines", { "source.ts": second }).diagnostics).toHaveLength(0);

  expect(
    runFixture("padding-lines", { "source.ts": "function f() { return 1; }" }).diagnostics,
  ).toHaveLength(0);
});

test("padding groups single-line const and export declarations together", () => {
  const source = 'const a = 1;\nexport const b = a;\nexport { a };\nexport * from "./other.ts";';
  expect(runFixture("padding-lines", { "source.ts": source }).diagnostics).toHaveLength(0);
});
