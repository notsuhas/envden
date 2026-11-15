import { defineRule, type ESTree } from "vite-plus/lint/plugins";

function name(node: ESTree.Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);

  return undefined;
}

function testCall(property: string | undefined, previousLine: string) {
  if (property === "only") return "Do not focus tests with .only.";
  if (property !== "skip") return undefined;
  if (/https:\/\/\S+\/(?:issues|issue|browse)\/\S+/.test(previousLine)) return undefined;

  return "A skipped test needs an issue link on the line above.";
}

function ambientClock(callee: ESTree.MemberExpression) {
  return name(callee.object) === "Date" && name(callee.property) === "now";
}

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce time injection, test safety, suppression reasons and production imports.",
    },
  },
  create(context) {
    const path = context.filename.replaceAll("\\", "/").replace(/^.*\/.fixtures-[^/]+\//, "/");
    const test = path.includes("/__tests__/");

    const clockBoundary =
      /\/apps\/(cli|server)\/src\/(main|program)\.ts$|\/apps\/cli\/src\/commands\//.test(path);

    const checkClock = /\/(apps|packages)\/.*\/src\//.test(path) && !clockBoundary;
    const lines = context.sourceCode.text.split("\n");
    const report = (node: ESTree.Node, message: string) => context.report({ node, message });

    function checkTest(node: ESTree.MemberExpression) {
      if (!test) return;
      const message = testCall(name(node.property), lines[node.loc.start.line - 2] ?? "");
      if (message) report(node, message);
    }

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (
            /(?:oxlint-disable(?:-next-line|-line)?|eslint-disable(?:-next-line|-line)?|@ts-(?:expect-error|ignore|nocheck))\b/.test(
              comment.value,
            ) &&
            !/--\s*\S.+/.test(comment.value)
          )
            context.report({
              loc: comment.loc,
              message: "Give the suppression a reason after --.",
            });
        }
      },
      ImportDeclaration(node) {
        if (!test && /^@envden\/testing(?:\/|$)/.test(String(node.source.value)))
          report(node, "Production code must not import @envden/testing.");
      },
      MemberExpression(node) {
        if (checkClock && ambientClock(node)) report(node, "Pass time as an argument.");
        checkTest(node);
      },
      NewExpression(node) {
        if (checkClock && name(node.callee) === "Date" && node.arguments.length === 0)
          report(node, "Pass time as an argument.");
      },
      Literal(node) {
        if (
          path.includes("/apps/web/src/") &&
          typeof node.value === "string" &&
          /#[\da-f]{3,8}\b/i.test(node.value)
        )
          report(node, "Use rgba() for literal colours.");
      },
    };
  },
});
