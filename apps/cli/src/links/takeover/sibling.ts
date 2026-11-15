import { dirname, join, relative, resolve, sep } from "node:path";
import type { IOwnLink } from "../file.ts";

// .env -> .env.development follows a file envden already syncs, so it isn't a link to take over
export function siblingLink(own: IOwnLink, envFiles: string[]) {
  const destination = join(own.checkout.root, own.path);
  const target = relative(own.checkout.root, resolve(dirname(destination), own.link));

  return envFiles.includes(target.split(sep).join("/"));
}
