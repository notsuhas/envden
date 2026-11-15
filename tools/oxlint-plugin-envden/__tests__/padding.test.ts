import { expect, test } from "bun:test";

import { diagnosticsFor, runFixture } from "./utils.ts";

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

const groups =
  'const a = 1;\nconst b = 2;\n\nexport { a };\nexport { b };\n\nexport type { TFoo } from "./foo.ts";\nexport type { TBar } from "./bar.ts";\n\nfunction f() {\n  setup();\n  work();\n\n  return a;\n}\n';

const declarations =
  'const a = 1;\nexport const b = a;\nexport { a };\nexport * from "./other.ts";';

const nested =
  "function f() {\n  setup();\n  if (ready) {\n    work();\n    return done;\n  }\n  finish();\n}\n";

const crlf = "let a = 1; // trailing\r\n// attached\r\nlet b = 2;\r\n\r\n\r\nlet c = 3;\r\n";

const reports = runFixture("padding-lines", {
  "source.ts": source,
  "groups.ts": groups,
  "declarations.ts": declarations,
  "inline.ts": "function f() { return 1; }",
}).diagnostics;

const fixes = runFixture(
  "padding-lines",
  {
    "source.ts": source,
    "fixed.ts": fixed,
    "nested.ts": nested,
    "crlf.ts": crlf,
    "same-line.ts": "let a = 1; let b = 2;",
  },
  true,
);

test("padding reports missing boundaries and fixes comments with their statements", () => {
  expect(diagnosticsFor(reports, "source.ts")).toHaveLength(7);
  expect(fixes.files["source.ts"]).toBe(fixed);
  expect(diagnosticsFor(fixes.diagnostics, "source.ts")).toHaveLength(0);
  expect(fixes.files["fixed.ts"]).toBe(fixed);
});

test("padding allows single-line groups and already padded declarations", () => {
  expect(diagnosticsFor(reports, "groups.ts")).toHaveLength(0);
  expect(diagnosticsFor(reports, "declarations.ts")).toHaveLength(0);
  expect(diagnosticsFor(reports, "inline.ts")).toHaveLength(0);
});

test("padding surrounds multiline function statements, including nested blocks", () => {
  expect(fixes.files["nested.ts"]).toBe(
    "function f() {\n  setup();\n\n  if (ready) {\n    work();\n\n    return done;\n  }\n\n  finish();\n}\n",
  );
});

test("padding preserves trailing comments, CRLF, and existing extra blank lines", () => {
  expect(fixes.files["crlf.ts"]).toBe(
    "let a = 1; // trailing\r\n\r\n// attached\r\nlet b = 2;\r\n\r\n\r\nlet c = 3;\r\n",
  );
});

test("padding inserts one newline per fix, even for same-line declarations", () => {
  const first = fixes.files["same-line.ts"]!;
  expect(first).toBe("let a = 1;\n let b = 2;");
  const second = runFixture("padding-lines", { "source.ts": first }, true).files["source.ts"]!;
  expect(second).toBe("let a = 1;\n\n let b = 2;");
  expect(runFixture("padding-lines", { "source.ts": second }).diagnostics).toHaveLength(0);
});
