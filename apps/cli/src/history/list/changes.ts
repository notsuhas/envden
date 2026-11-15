import { diffEnvKeys } from "@envden/core/merge";

export type TVersionKind = "live" | "deleted" | "restored" | "lost";

export type TKeyChanges =
  | { added: string[]; changed: string[]; removed: string[] }
  | "unparsed"
  | "unknown";

const kinds: Record<number, TVersionKind> = { 1: "live", 2: "deleted", 3: "restored", 4: "lost" };

export function versionKind(state: number): TVersionKind {
  return kinds[state] ?? "live";
}

// Newest first; the oldest version is a creation only when no older version was pruned.
export function versionChanges(
  versions: readonly { content: Uint8Array | undefined }[],
  complete: boolean,
): TKeyChanges[] {
  return versions.map((version, index) => {
    const previous = versions[index + 1];
    if (!previous && !complete) return "unknown";

    const diff = diffEnvKeys(previous?.content ?? empty, version.content ?? empty);
    if (diff.kind === "conflict") return "unparsed";

    return { added: diff.added, changed: diff.changed, removed: diff.removed };
  });
}

const empty = new Uint8Array();
