import path from "node:path";

export type TRootPlacement = "root" | "inside" | "outside";

type TPathApi = Pick<typeof path, "relative" | "isAbsolute" | "sep">;

export function placeInRoot(root: string, target: string, api: TPathApi = path): TRootPlacement {
  const rel = api.relative(root, target);

  if (rel === "") return "root";
  if (api.isAbsolute(rel) || rel === ".." || rel.startsWith(`..${api.sep}`)) return "outside";

  return "inside";
}
