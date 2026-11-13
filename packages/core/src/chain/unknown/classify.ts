import { equal, compareSemver } from "../../protocol/index.ts";

export function classifyUnknownData(input: {
  received: Uint8Array;
  stored?: Uint8Array | undefined;
  mismatch: "rollback" | "fork";
  verify: () => boolean;
  unknownFormat: boolean;
  currentVersion: string;
  latestVersion: string;
}): { kind: "known" | "rollback" | "fork" | "invalid" | "update-required" | "unreadable" } {
  if (input.stored && !equal(input.received, input.stored)) return { kind: input.mismatch };

  try {
    if (!input.verify()) return { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }

  if (!input.unknownFormat) return { kind: "known" };

  return {
    kind:
      compareSemver(input.currentVersion, input.latestVersion) >= 0
        ? "unreadable"
        : "update-required",
  };
}
