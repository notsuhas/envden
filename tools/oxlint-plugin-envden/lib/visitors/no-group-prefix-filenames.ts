import type { defineRule } from "vite-plus/lint/plugins";
import { type ESTree } from "vite-plus/lint/plugins";
import { basename, dirname } from "node:path";
import { sourceSiblings } from "../siblings.ts";

const EXEMPT_PREFIXES = new Set(["use"]);

type TContext = Parameters<NonNullable<Parameters<typeof defineRule>[0]["create"]>>[0];

export function checkFilenameProgram(
  context: Pick<TContext, "filename" | "report">,
  node: ESTree.Program,
) {
  const name = basename(context.filename);

  if (
    !/^[^-]+-.+\.ts$/u.test(name) ||
    /\.(?:test|spec)\.ts$/u.test(name) ||
    basename(dirname(context.filename)) === "__tests__"
  )
    return;

  const prefix = name.slice(0, name.indexOf("-"));

  if (EXEMPT_PREFIXES.has(prefix)) return;

  if (
    sourceSiblings(context.filename).filter(
      (sibling) => sibling.startsWith(`${prefix}-`) && sibling.endsWith(".ts"),
    ).length >= 2
  ) {
    context.report({
      node,
      message: `Move related ${prefix}- files into a ${prefix}/ folder.`,
    });
  }
}
