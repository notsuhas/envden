import type { ESTree } from "vite-plus/lint/plugins";
import { defineRule } from "vite-plus/lint/plugins";

import {
  subprocessModule,
  loadsSubprocess,
  exemptProcessPath,
  registerBunImport,
  registerProcessAlias,
  forbiddenMember,
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
        if (node.source.value !== "bun") return;

        node.specifiers
          .filter((specifier) => registerBunImport(specifier, bunAliases))
          .forEach(report);
      },
      VariableDeclarator(node) {
        if (registerProcessAlias(node, [bunAliases, processAliases])) report(node);
      },
      MemberExpression(node) {
        if (node.object.type !== "Identifier") return;

        if (forbiddenMember(node.object.name, node.property, bunAliases, processAliases))
          report(node);
      },
      ImportExpression(node) {
        if (loadsSubprocess(node.source)) report(node);
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "require") return;
        if (loadsSubprocess(node.arguments[0])) report(node);
      },
    };
  },
});
