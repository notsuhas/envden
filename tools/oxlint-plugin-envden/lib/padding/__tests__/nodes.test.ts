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

test("padding helper branches retain direct coverage", () => {
  for (const [value, group] of [
    [node("VariableDeclaration", { kind: "const" }), "value"],
    [node("ExportNamedDeclaration", { exportKind: "type", source: {} }), "type"],
    [node("ReturnStatement"), undefined],
  ] as const)
    expect(grouped(value)).toBe(group);

  for (const [previous, next, topLevel, expected] of [
    [node("ImportDeclaration"), node("VariableDeclaration"), true, true],
    [
      node("VariableDeclaration", { kind: "const" }),
      node("VariableDeclaration", { kind: "const" }),
      true,
      false,
    ],
    [node("ExpressionStatement"), node("ReturnStatement"), false, true],
    [node("ExpressionStatement"), node("ExpressionStatement"), false, false],
  ] as const)
    expect(needsPadding(previous, next, topLevel)).toBe(expected);

  expect(insideFunction(node("BlockStatement", { parent: node("ArrowFunctionExpression") }))).toBe(
    true,
  );

  expect(insideFunction(node("Program"))).toBe(false);
});
