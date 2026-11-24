import path from "node:path";

export type TRootPlacement = "root" | "inside" | "outside";

export function placeInRoot(root: string, target: string): TRootPlacement {
  const rel = path.relative(root, target);

  if (rel === "") return "root";
  if (path.isAbsolute(rel) || rel === ".." || rel.startsWith(`..${path.sep}`)) return "outside";

  return "inside";
}
