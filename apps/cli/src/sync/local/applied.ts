import { join } from "node:path";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";

export async function appliedFiles(home: string): Promise<Record<string, string>> {
  return JSON.parse((await optionalRead(join(home, "state", "applied-files.json"))) ?? "{}");
}

export async function saveAppliedFiles(home: string, files: Record<string, string>): Promise<void> {
  await atomicWrite(join(home, "state", "applied-files.json"), JSON.stringify(files));
}
