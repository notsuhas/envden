import { collectExportNames } from "../lib/visitors/type-name-prefix.ts";
import { defineRule, type ESTree } from "vite-plus/lint/plugins";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "AGENTS.md: interfaces are I<Name>, never with a Props suffix; type aliases are T<Name>.",
    },
  },
  create(context) {
    const exported = new Set<string>();

    return {
      Program(node) {
        collectExportNames(context, node, exported);
      },
      TSInterfaceDeclaration(node) {
        if (!/^I[A-Z]/u.test(node.id.name) || node.id.name.endsWith("Props")) {
          context.report({
            node: node.id,
            message:
              "Name interfaces I<Name>, with an uppercase letter after I and no Props suffix.",
          });
        }
      },
      TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
        if (
          (node.parent.type === "ExportNamedDeclaration" || exported.has(node.id.name)) &&
          !/^T[A-Z]/u.test(node.id.name)
        ) {
          context.report({
            node: node.id,
            message: "Name exported type aliases T<Name>, with an uppercase letter after T.",
          });
        }
      },
    };
  },
});
