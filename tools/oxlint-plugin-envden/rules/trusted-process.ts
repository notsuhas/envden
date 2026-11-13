import type { ESTree } from "vite-plus/lint/plugins";
import { defineRule } from "vite-plus/lint/plugins";

export default defineRule({
  meta: {
    type: "problem",
    docs: { description: "Subprocesses must use the trusted core runner." },
  },
  create(context) {
    const path = context.filename.replaceAll("\\", "/").replace(/^.*\/.fixtures-[^/]+\//, "/");
    if (!/\/(packages|apps)\//.test(path)) return {};
    if (path.includes("/packages/core/src/process/")) return {};

    return {
      ImportDeclaration(node) {
        if (/^(node:)?child_process$/.test(String(node.source.value)))
          context.report({ node, message: "Use @envden/core/process to start subprocesses." });
      },
      MemberExpression(node) {
        if (node.object.type !== "Identifier" || node.object.name !== "Bun") return;
        const property = node.property;

        if (forbiddenProperty(property))
          context.report({ node, message: "Use @envden/core/process to start subprocesses." });
      },
      ImportExpression(node) {
        if (
          node.source.type === "Literal" &&
          /^(node:)?child_process$/.test(String(node.source.value))
        )
          context.report({ node, message: "Use @envden/core/process to start subprocesses." });
      },
    };
  },
});

function forbiddenProperty(property: ESTree.Node): boolean {
  if (property.type === "Identifier") return ["spawn", "spawnSync", "$"].includes(property.name);

  if (property.type === "Literal")
    return ["spawn", "spawnSync", "$"].includes(String(property.value));

  return false;
}
