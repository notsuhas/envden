import { same } from "../files.ts";

interface IContent {
  detached?: boolean;
  tombstone?: boolean;
  applied?: boolean;
  linked: boolean;
  useStore: boolean;
  mine: Uint8Array | undefined;
  server: Uint8Array | undefined;
  previous: Uint8Array | undefined;
  choosing: boolean;
  repair: boolean;
}

export function deriveContentAction(input: IContent) {
  const { linked, mine, server, previous, choosing, repair } = input;

  if (input.detached) return { kind: "detached" } as const;

  if (deriveUntrackedConflict(input).kind === "conflict") return { kind: "conflict" } as const;

  if (repair && mine !== undefined) return { kind: "repair-conflict" } as const;

  if (input.tombstone && !input.applied && previous === undefined && mine !== undefined)
    return { kind: "choose" } as const;

  if (choosing && mine !== undefined && !same(mine, server)) return { kind: "choose" } as const;

  if (
    (linked || mine !== undefined) &&
    !same(server, previous) &&
    !same(mine, previous) &&
    !same(mine, server)
  )
    return { kind: "choose" } as const;

  return { kind: "write", next: deriveDefaultContent(input) } as const;
}

export function deriveDefaultContent({
  linked,
  useStore,
  mine,
  server,
  previous,
}: Pick<IContent, "linked" | "useStore" | "mine" | "server" | "previous">) {
  return (linked || (useStore && mine !== undefined)) && same(server, previous) ? mine : server;
}

export function deriveStoreSource(mode: "link" | "copy", status: string, linked: boolean) {
  return (
    mode === "link" &&
    status !== "detached" &&
    (linked || status === "missing" || status === "linked")
  );
}

export function deriveUntrackedConflict({
  linked,
  useStore,
  mine,
  server,
  choosing,
}: Pick<IContent, "linked" | "useStore" | "mine" | "server" | "choosing">) {
  if (!linked && !useStore && mine !== undefined && !same(mine, server) && !choosing)
    return { kind: "conflict" } as const;

  return { kind: "continue" } as const;
}

export function needsConflict(
  kind: ReturnType<typeof deriveContentAction>["kind"],
  choosing: boolean,
  detachedChoice: boolean,
) {
  return (
    kind === "conflict" ||
    kind === "repair-conflict" ||
    (kind === "detached" && !choosing && !detachedChoice)
  );
}
