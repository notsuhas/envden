import { assetName, targets } from "../../../apps/cli/scripts/targets.ts";
import { parseChecksums } from "../channels/render.ts";

export function verifyReleaseChecksums(published: string, rebuilt: string): void {
  const expected = parseChecksums(published);
  const actual = parseChecksums(rebuilt);

  if (targets.some((target) => expected.get(assetName(target)) !== actual.get(assetName(target))))
    throw new Error(
      "Published tag was rebuilt with different binaries. Re-run only failed jobs from the original run; release a new version for changed binaries. Published assets cannot be replaced.",
    );
}

export function verifyNpmChecksums(pinned: unknown, published: string): void {
  const hashes = parseChecksums(published);

  if (
    typeof pinned !== "object" ||
    pinned === null ||
    Object.keys(pinned).length !== targets.length ||
    targets.some(
      (target) =>
        !(target in pinned) || Reflect.get(pinned, target) !== hashes.get(assetName(target)),
    )
  )
    throw new Error(
      "Published npm package checksums differ from the published release; release a new version.",
    );
}
