import { readFileSync } from "node:fs";
import { join } from "node:path";
import { start } from "../markers.ts";

export function bashRcPath(home: string, platform = process.platform) {
  if (platform !== "darwin") return join(home, ".bashrc");

  const candidates = [".bashrc", ".bash_profile", ".bash_login", ".profile"].map((name) => ({
    name,
    content: read(join(home, name)),
  }));

  const installed = candidates.find((file) => file.content?.includes(start));
  if (installed) return join(home, installed.name);
  const profile = candidates.slice(1).find((file) => file.content !== undefined);
  if (!profile) return join(home, ".bash_profile");

  const sourcesRc = profile
    .content!.split("\n")
    .some(
      (line) =>
        !line.trimStart().startsWith("#") &&
        /(?:^|[\s;&|])(?:source|\.)\s+["']?(?:~|\$HOME|\$\{HOME\})\/\.bashrc["']?(?:\s|;|$)/.test(
          line,
        ),
    );

  return join(home, sourcesRc ? ".bashrc" : profile.name);
}

function read(path: string) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
