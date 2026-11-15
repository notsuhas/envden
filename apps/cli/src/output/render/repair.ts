import { sanitizeConsole } from "../sanitize.ts";
import type { finishRepair } from "../../admin/repair/finish.ts";

type TFinish = Awaited<ReturnType<typeof finishRepair>>;

export function repairText(result: TFinish) {
  return sanitizeConsole(repairLines(result).join("\n"));
}

function repairLines(result: TFinish) {
  switch (result.kind) {
    case "missing-reports":
      return [
        `Waiting for ${result.devices.join(", ")} to run envden server repair.`,
        "Run it on each, or finish without them using --without <device>; they rejoin as new devices.",
      ];
    case "missing-blobs":
      return [
        ...(result.missing.length
          ? [
              `Waiting for uploads of ${fileNames(result.missing)}.`,
              "Run envden server repair on the devices that have them, then finish again.",
            ]
          : []),
        ...(result.lost.length
          ? [
              `No device has the newest version of ${fileNames(result.lost)}.`,
              "Check those files, then finish with --accept-lost to use the newest older version.",
            ]
          : []),
      ];
    case "finished":
      return [
        "Server restore finished",
        ...(result.report ? ["", result.report] : []),
        ...(result.replaceKit
          ? ["The restored server can't vouch for the current recovery kit; replace it."]
          : []),
      ];
  }
}

function fileNames(files: { repoId: string; path: string }[]) {
  return files.map((file) => `${file.repoId}/${file.path}`).join(", ");
}
