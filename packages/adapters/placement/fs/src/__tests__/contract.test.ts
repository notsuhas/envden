import { placementContract } from "@envden/testing/placement";
import { createFsPlacementAdapter } from "../index.ts";

for (const mode of ["link", "copy"] as const) {
  placementContract(`Filesystem ${mode}`, (root, backups) =>
    createFsPlacementAdapter(mode, root, backups),
  );
}
