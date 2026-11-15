import { join } from "node:path";
import type { IRepoSkip } from "../../../links/discovery/identify.ts";
import type { IOwnLink } from "../../../links/file.ts";
import { homePath } from "../../home-path.ts";
import { sanitizeTerminal } from "../../sanitize.ts";

export function repoSkipLine(skip: IRepoSkip, userHome: string): string {
  return sanitizeTerminal(`${homePath(skip.path, userHome)}: skipped: ${skip.reason}`);
}

export function ownLinkLine(link: IOwnLink, userHome: string): string {
  const shown = homePath(join(link.checkout.root, link.path), userHome);

  return `envden: skipped ${sanitizeTerminal(shown)}: it links to ${sanitizeTerminal(link.link)}, and envden only syncs files it owns`;
}
