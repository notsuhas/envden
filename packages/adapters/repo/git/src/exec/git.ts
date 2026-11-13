import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await exec(
    "git",
    [...(args[0] === "ls-files" ? ["--literal-pathspecs"] : []), "-C", root, ...args],
    {
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  return stdout;
}
