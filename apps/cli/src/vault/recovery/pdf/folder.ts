import { stat } from "node:fs/promises";
import { join } from "node:path";

// stat follows symlinks, so a Downloads link to another disk still counts.
export async function kitFolder(userHome: string): Promise<string> {
  const downloads = join(userHome, "Downloads");
  const found = await stat(downloads).catch(() => undefined);

  return found?.isDirectory() ? downloads : userHome;
}
