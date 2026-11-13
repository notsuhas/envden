import type { ESTree } from "vite-plus/lint/plugins";

type TNode = ESTree.Node;

function singleLine(node: TNode) {
  return node.loc.start.line === node.loc.end.line;
}

export function grouped(node: TNode) {
  if (!singleLine(node)) return undefined;

  if (node.type === "VariableDeclaration" && node.kind === "const") return "value";

  if (node.type === "ExportDefaultDeclaration") return "value";

  if (node.type !== "ExportNamedDeclaration" && node.type !== "ExportAllDeclaration")
    return undefined;

  if (node.exportKind === "type" && node.source) return "type";

  return "value";
}

export function insideFunction(node: TNode) {
  let parent = node.parent;

  while (parent) {
    if (
      parent.type === "FunctionDeclaration" ||
      parent.type === "FunctionExpression" ||
      parent.type === "ArrowFunctionExpression"
    )
      return true;

    parent = parent.parent;
  }

  return false;
}

export function needsPadding(previous: TNode, next: TNode, topLevel: boolean) {
  if (previous.type === "ImportDeclaration") return next.type !== "ImportDeclaration";
  const group = grouped(previous);

  return topLevel
    ? !(group && group === grouped(next))
    : next.type === "ReturnStatement" || !singleLine(previous) || !singleLine(next);
}

export function groupedFields(previous: TNode, next: TNode) {
  return (
    previous.type === "PropertyDefinition" &&
    next.type === "PropertyDefinition" &&
    singleLine(previous) &&
    singleLine(next)
  );
}
