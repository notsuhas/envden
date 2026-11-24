import { chmod } from "node:fs/promises";
import { chmodSync } from "node:fs";

export async function restrictAccess(path: string, directory = false): Promise<void> {
  await chmod(path, directory ? 0o700 : 0o600);
}

// for callers that can't await, such as opening the server database
export function restrictAccessSync(path: string, directory = false): void {
  chmodSync(path, directory ? 0o700 : 0o600);
}
