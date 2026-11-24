import { sanitizeConsole } from "../../sanitize.ts";
import type { exposedNames } from "../../../admin/devices/exposure.ts";

export function exposureText(exposure: Awaited<ReturnType<typeof exposedNames>>) {
  const lines = exposure.files.length
    ? [
        "This device could read:",
        ...exposure.files.map((file) => `  ${file.repoId}/${file.path}: ${file.keys.join(", ")}`),
        "It may have kept copies, so change these values where they're issued.",
      ]
    : ["This device couldn't read any env files."];

  if (exposure.incomplete)
    lines.push("Some history couldn't be read, so this list may be incomplete.");

  return sanitizeConsole(lines.join("\n"));
}

export function noRequestText(address: string) {
  return sanitizeConsole(
    `No device is waiting to join. On the new device run: envden join ${address}`,
  );
}

export function approvalText(result: { kind: "approved"; name?: string } | { kind: "declined" }) {
  if (result.kind === "declined") return "Declined; the join request was cancelled";

  return sanitizeConsole(result.name ? `Device ${result.name} added` : "Device added");
}
