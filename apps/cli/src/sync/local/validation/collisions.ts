export function pathCollisions(paths: readonly string[], insensitive: boolean): Set<number> {
  const spellings = new Map<string, string>();
  const collisions = new Set<number>();

  const ordered = [...paths.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));

  for (const [index, path] of ordered) {
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
