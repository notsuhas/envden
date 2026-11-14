const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validateTag(tag: string, versions: readonly string[]): void {
  if (!stableTag.test(tag) || tag.trim() !== tag) throw new Error("Expected a stable vX.Y.Z tag");

  if (versions.some((version) => `v${version}` !== tag)) {
    throw new Error("Tag/version mismatch");
  }
}

export function isHighestRelease(tag: string, releasedTags: readonly string[]): boolean {
  validateTag(tag, []);
  const current = tag.slice(1).split(".").map(BigInt);

  return !releasedTags.some((released) => {
    if (!stableTag.test(released) || released.trim() !== released) return false;
    const parts = released.slice(1).split(".").map(BigInt);

    for (const [index, part] of parts.entries()) {
      const value = current[index];
      if (value === undefined) throw new Error("Invalid version");
      if (part !== value) return part > value;
    }

    return false;
  });
}
