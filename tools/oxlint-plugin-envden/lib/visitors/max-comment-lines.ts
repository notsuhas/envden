import type { defineRule } from "vite-plus/lint/plugins";
import { type ESTree } from "vite-plus/lint/plugins";

const directive = /^\s*(?:@ts-expect-error\b|oxlint-disable(?:-next-line|-line)?\b)/u;
const license = /@license\b|\bcopyright\b|SPDX-License-Identifier|^!/iu;

type TContext = Parameters<NonNullable<Parameters<typeof defineRule>[0]["create"]>>[0];

export function checkCommentProgram(
  context: Pick<TContext, "sourceCode" | "report">,
  node: ESTree.Program,
) {
  const groups = commentGroups(context.sourceCode.getAllComments());

  for (const group of groups) {
    const first = group[0]!;
    const last = group.at(-1)!;

    const isHeader =
      first.range[0] < (node.body[0]?.range[0] ?? Infinity) &&
      context.sourceCode.text.slice(0, first.range[0]).trim() === "";

    if (isHeader && license.test(group.map((comment) => comment.value).join("\n"))) continue;

    if (last.loc.end.line > first.loc.start.line) {
      context.report({
        loc: { start: first.loc.start, end: last.loc.end },
        message: "Keep comments to one line; let names and code carry the explanation.",
      });
    }
  }
}

function commentGroups(comments: readonly ESTree.Comment[]) {
  const groups: ESTree.Comment[][] = [];

  for (const comment of comments) {
    if (directive.test(comment.value) && comment.loc.start.line === comment.loc.end.line) continue;

    const group = groups.at(-1);
    const previous = group?.at(-1);

    if (
      comment.type === "Line" &&
      previous?.type === "Line" &&
      comment.loc.start.line === previous.loc.end.line + 1
    ) {
      group!.push(comment);
    } else {
      groups.push([comment]);
    }
  }

  return groups;
}
