import { randomUUID } from "node:crypto";
import { rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import type { TPlacementMode } from "@envden/core/adapters";

export async function supported(mode: TPlacementMode, dir: string): Promise<boolean> {
  if (mode === "copy") return true;
  const probe = join(dir, `.envden-probe-${randomUUID()}`);

  try {
    await symlink(".envden-probe-target", probe);

    return true;
  } catch {
    return false;
  } finally {
    await rm(probe, { force: true });
  }
}
