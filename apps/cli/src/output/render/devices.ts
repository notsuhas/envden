import { sanitizeConsole } from "../sanitize.ts";
import type { exposedNames } from "../../admin/devices/exposure.ts";

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

export function pairingText(address: string, code: string) {
  return sanitizeConsole(
    [
      `On the new device run: envden join ${address}`,
      `and enter code ${code} (valid 10 minutes). Keep this running.`,
    ].join("\n"),
  );
}

export function pairedText(kind: "paired" | "declined", name?: string) {
  if (kind === "declined") return "Declined";

  return sanitizeConsole(name ? `Device ${name} added` : "Device added");
}
