import { gitSession } from "../exec/git.ts";
import { globalConfig } from "../exec/global-config.ts";

// Global url rewrites change the URL every clone sees, so the Repo ID must use them too.
export async function remoteUrl(root: string, name: string): Promise<string> {
  const git = await gitSession(root, await globalConfig("^url\\..*\\.insteadof$"));

  return (await git(["remote", "get-url", name])).trim();
}
