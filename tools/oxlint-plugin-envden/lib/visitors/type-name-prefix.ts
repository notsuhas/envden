import type { defineRule } from "vite-plus/lint/plugins";
import { type ESTree } from "vite-plus/lint/plugins";

type TContext = Parameters<NonNullable<Parameters<typeof defineRule>[0]["create"]>>[0];

export function collectExportNames(
  context: Pick<TContext, "report">,
  node: ESTree.Program,
  exported: Set<string>,
) {
  for (const statement of node.body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.source) continue;

    for (const specifier of statement.specifiers) {
      if (specifier.local.type === "Identifier") exported.add(specifier.local.name);
    }
  }
}
