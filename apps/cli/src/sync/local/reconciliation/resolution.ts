import { mergeEnv } from "@envden/core/merge";
import type { TSyncContext } from "../../remote/context.ts";

export async function resolveContent(
  context: { options: Pick<TSyncContext["options"], "yes" | "report" | "confirm"> },
  path: string,
  mine: Uint8Array | undefined,
  server: Uint8Array | undefined,
  previous: Uint8Array | undefined,
  choose?: (path: string) => Promise<"keep-mine" | "take-server" | "merge">,
  defaultContent?: Uint8Array,
) {
  const choice = choose ? await choose(path) : "merge";
  if (choice === "keep-mine") return { kind: "write", next: mine } as const;
  if (choice === "take-server") return { kind: "write", next: defaultContent } as const;

  const merged = mine && server && previous ? mergeEnv(previous, mine, server) : undefined;

  if (merged?.kind === "clean")
    context.options.report?.(`Merge ${path}: ${merged.changedKeys.join(", ")}`);

  if (!merged || merged.kind === "conflict") return { kind: "conflict" } as const;

  if (!context.options.yes && !(await context.options.confirm?.(merged.changedKeys)))
    return { kind: "conflict" } as const;

  context.options.report?.(`Merged ${path}: ${merged.changedKeys.join(", ")}`);

  return { kind: "write", next: merged.bytes } as const;
}
