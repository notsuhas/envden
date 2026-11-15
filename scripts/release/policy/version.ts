import { compareSemver, isSemver } from "@envden/core/protocol";

function isStableTag(tag: string) {
  return tag.startsWith("v") && isSemver(tag.slice(1));
}

export function validateTag(tag: string, versions: readonly string[]): void {
  if (!isStableTag(tag)) throw new Error("Expected a stable vX.Y.Z tag");

  if (versions.some((version) => `v${version}` !== tag)) {
    throw new Error("Tag/version mismatch");
  }
}

export function isHighestRelease(tag: string, releasedTags: readonly string[]): boolean {
  validateTag(tag, []);

  return !releasedTags.some(
    (released) => isStableTag(released) && compareSemver(released.slice(1), tag.slice(1)) > 0,
  );
}
