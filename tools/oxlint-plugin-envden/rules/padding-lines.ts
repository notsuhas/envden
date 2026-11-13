import { paddingBoundary } from "../lib/padding/boundary.ts";
import { insideFunction, needsPadding, groupedFields } from "../lib/padding/nodes.ts";
import { defineRule, type ESTree } from "vite-plus/lint/plugins";

type TNode = ESTree.Node;

export default defineRule({
  meta: {
    type: "layout",
    fixable: "whitespace",
    docs: {
      description:
        "AGENTS.md: let code breathe after imports, between declarations and members, and around logical steps.",
    },
  },
  create(context) {
    const source = context.sourceCode;
    const reported = new Set<number>();

    const separate = (previous: TNode, next: TNode) => {
      const { anchor, end } = paddingBoundary(source, previous, next);

      const gap = source.text.slice(end, anchor.range[0]);

      if (/\r?\n[\t ]*\r?\n/u.test(gap) || reported.has(anchor.range[0])) return;

      reported.add(anchor.range[0]);

      context.report({
        node: next,
        message: "Leave a blank line between these code steps.",
        fix(fixer) {
          const lineStart = source.text.lastIndexOf("\n", anchor.range[0] - 1) + 1;
          const position = lineStart >= end ? lineStart : end;
          const newline = source.text.includes("\r\n") ? "\r\n" : "\n";

          return fixer.insertTextBeforeRange([position, position], newline);
        },
      });
    };

    const checkBody = (body: readonly TNode[], topLevel: boolean) => {
      for (let index = 1; index < body.length; index++) {
        const previous = body[index - 1]!;
        const next = body[index]!;

        if (needsPadding(previous, next, topLevel)) separate(previous, next);
      }
    };

    return {
      Program(node) {
        checkBody(node.body, true);
      },
      BlockStatement(node) {
        if (insideFunction(node)) checkBody(node.body, false);
      },
      SwitchCase(node) {
        if (insideFunction(node)) checkBody(node.consequent, false);
      },
      ClassBody(node) {
        for (let index = 1; index < node.body.length; index++) {
          const previous = node.body[index - 1]!;
          const next = node.body[index]!;

          const fields = groupedFields(previous, next);

          if (!fields) separate(previous, next);
        }
      },
    };
  },
});
