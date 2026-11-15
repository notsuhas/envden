import { isAbsolute, join, relative, sep } from "node:path";

export function checkoutPath(cwd: string | undefined, root: string, path: string) {
  const absolute = join(root, path);
  if (cwd === undefined) return absolute;
  const nearby = relative(cwd, absolute);

  return nearby && !isAbsolute(nearby) && nearby.split(sep)[0] !== ".." ? nearby : absolute;
}
