import { test, expect } from "bun:test";
import type { ESTree } from "vite-plus/lint/plugins";
import { grouped, needsPadding, insideFunction } from "../nodes.ts";

function node(type: string, extra = {}): ESTree.Node {
  return {
    type,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
    ...extra,
  } as ESTree.Node;
}

test.each([
  [node("VariableDeclaration", { kind: "const" }), "value"],
  [node("ExportNamedDeclaration", { exportKind: "type", source: {} }), "type"],
  [node("ReturnStatement"), undefined],
] as const)("grouping %j", (value, group) => expect(grouped(value)).toBe(group));

test.each([
  [node("ImportDeclaration"), node("VariableDeclaration"), true, true],
  [
    node("VariableDeclaration", { kind: "const" }),
    node("VariableDeclaration", { kind: "const" }),
    true,
    false,
  ],
  [node("ExpressionStatement"), node("ReturnStatement"), false, true],
  [node("ExpressionStatement"), node("ExpressionStatement"), false, false],
] as const)("padding %j %j", (previous, next, topLevel, expected) =>
  expect(needsPadding(previous, next, topLevel)).toBe(expected),
);

test("function ancestry stops at the nearest function", () => {
  expect(insideFunction(node("BlockStatement", { parent: node("ArrowFunctionExpression") }))).toBe(
    true,
  );

  expect(insideFunction(node("Program"))).toBe(false);
});
