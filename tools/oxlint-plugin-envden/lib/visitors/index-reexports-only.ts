import type { defineRule } from "vite-plus/lint/plugins";
import { type ESTree } from "vite-plus/lint/plugins";
import { basename } from "node:path";

type TContext = Parameters<NonNullable<Parameters<typeof defineRule>[0]["create"]>>[0];

export function checkIndexProgram(
  context: Pick<TContext, "filename" | "report">,
  node: ESTree.Program,
) {
  if (!/^index\.tsx?$/u.test(basename(context.filename))) return;

  for (const statement of node.body) {
    if (
      statement.type === "ExportAllDeclaration" ||
      (statement.type === "ExportNamedDeclaration" && statement.source)
    )
      continue;

    context.report({
      node: statement,
      message: "Index files only re-export from other modules.",
    });
  }
}
