import { withStateLock } from "../state/lock/lock.ts";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { loadState, saveState } from "../state/store/repository.ts";
import { NOT_SET_UP } from "../state/configured.ts";

async function lockedAliasRepo(adapters: TAdapters, source: string, target: string): Promise<void> {
  const state = await loadState(adapters.home);
  if (!state) throw new EnvdenError("NOT_FOUND", NOT_SET_UP);

  const decision = deriveAlias(state.aliases, source, target);

  if (decision.kind === "invalid")
    throw new EnvdenError("INVALID_INPUT", "Provide different repo IDs");

  if (decision.kind === "chain") throw new EnvdenError("CONFLICT", "Alias chains are not allowed");

  state.aliases[source] = target;
  await saveState(adapters.home, state, adapters.now);
}

export function deriveAlias(aliases: Record<string, string>, source: string, target: string) {
  if (!source || !target || source === target) return { kind: "invalid" } as const;
  if (aliases[target] || Object.values(aliases).includes(source)) return { kind: "chain" } as const;

  return { kind: "assign" } as const;
}

export function aliasRepo(...args: Parameters<typeof lockedAliasRepo>) {
  return withStateLock(args[0].home, () => lockedAliasRepo(...args));
}
