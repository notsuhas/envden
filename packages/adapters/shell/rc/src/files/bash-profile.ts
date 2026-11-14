import { readFileSync } from "node:fs";
import { join } from "node:path";

export function bashRcPath(home: string, platform = process.platform) {
  if (platform !== "darwin") return join(home, ".bashrc");
  const profile = join(home, ".bash_profile");
  let content = "";

  try {
    content = readFileSync(profile, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }

  return /(?:^|[;\n])\s*(?:source|\.)\s+["']?(?:~|\$HOME|\$\{HOME\})\/\.bashrc["']?(?:\s|;|$)/.test(
    content,
  )
    ? join(home, ".bashrc")
    : profile;
}
