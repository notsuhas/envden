import type { ESTree } from "vite-plus/lint/plugins";
import { defineRule } from "vite-plus/lint/plugins";

import {
  subprocessModule,
  loadsSubprocess,
  exemptProcessPath,
  registerBunImport,
  registerProcessAlias,
  forbiddenMember,
  registerProcessImport,
  reexportsSubprocess,
  memberOwner,
  loadsBuiltinSubprocess,
  requiresSubprocess,
} from "../lib/process.ts";

export default defineRule({
  meta: {
    type: "problem",
    docs: { description: "Subprocesses must use the trusted core runner." },
  },
  create(context) {
    const path = context.filename.replaceAll("\\", "/").replace(/^.*\/.fixtures-[^/]+\//, "/");
    if (!/\/(packages|apps|tools|scripts)\//.test(path)) return {};

    if (exemptProcessPath(path)) return {};

    const bunAliases = new Set(["Bun"]);
    const processAliases = new Set(["process"]);

    const report = (node: ESTree.Node) =>
      context.report({ node, message: "Use @envden/core/process to start subprocesses." });

    return {
      ImportDeclaration(node) {
        if (subprocessModule(node.source.value)) report(node);
        registerProcessImport(node, processAliases).forEach(report);
        if (node.source.value !== "bun") return;

        node.specifiers
          .filter((specifier) => registerBunImport(specifier, bunAliases))
          .forEach(report);
      },
      VariableDeclarator(node) {
        if (registerProcessAlias(node, [bunAliases, processAliases])) report(node);
      },
      ExportNamedDeclaration(node) {
        if (reexportsSubprocess(node.source)) report(node);
      },
      ExportAllDeclaration(node) {
        if (reexportsSubprocess(node.source)) report(node);
      },
      MemberExpression(node) {
        const owner = memberOwner(node.object);

        if (owner && forbiddenMember(owner, node.property, bunAliases, processAliases))
          report(node);
      },
      ImportExpression(node) {
        if (loadsSubprocess(node.source)) report(node);
      },
      CallExpression(node) {
        if (loadsBuiltinSubprocess(node, processAliases) || requiresSubprocess(node)) report(node);
      },
    };
  },
});
