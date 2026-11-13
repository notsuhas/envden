import type { defineRule, ESTree } from "vite-plus/lint/plugins";

type TContext = Parameters<NonNullable<Parameters<typeof defineRule>[0]["create"]>>[0];

export function paddingBoundary(
  source: TContext["sourceCode"],
  previous: ESTree.Node,
  next: ESTree.Node,
) {
  const leading = source
    .getCommentsBefore(next)
    .filter(
      (comment) =>
        comment.range[0] >= previous.range[1] && comment.loc.start.line > previous.loc.end.line,
    );

  const anchor = leading[0] ?? next;

  const trailing = source
    .getCommentsAfter(previous)
    .find(
      (comment) =>
        comment.loc.start.line === previous.loc.end.line && comment.range[1] <= anchor.range[0],
    );

  const end = trailing ? trailing.range[1] : previous.range[1];

  return { anchor, end };
}
