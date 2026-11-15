import { join } from "node:path";
import { atomicWrite, privateDirectory } from "../state/store/files.ts";

export async function writeReport(
  home: string,
  document: string,
  now: () => number,
): Promise<string> {
  const directory = join(home, "reports");
  await privateDirectory(directory);

  const path = join(directory, `${new Date(now()).toISOString().replace(/[:.]/g, "-")}.md`);
  await atomicWrite(path, document, now);

  return path;
}
