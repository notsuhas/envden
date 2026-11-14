export function pathCollisions(paths: readonly string[], insensitive: boolean): Set<number> {
  const spellings = new Map<string, string>();
  const collisions = new Set<number>();

  for (const [index, path] of paths.entries()) {
    const parts = path.split("/");

    for (let length = 1; length <= parts.length; length++) {
      const prefix = parts.slice(0, length).join("/");
      const normalized = prefix.normalize("NFC");
      const key = insensitive ? normalized.toLowerCase() : normalized;
      const previous = spellings.get(key);

      if (previous !== undefined && previous !== prefix) collisions.add(index);
      else spellings.set(key, prefix);
    }
  }

  return collisions;
}
