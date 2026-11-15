import { keychainUnavailable } from "./unavailable.ts";

const lockedCodes = [
  "ERR_SECRETS_INTERACTION_NOT_ALLOWED",
  "ERR_SECRETS_AUTH_FAILED",
  "ERR_SECRETS_INTERACTION_REQUIRED",
];

const locked: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "macOS keychain is locked. Unlock it, or run security unlock-keychain over SSH",
  linux: "The Secret Service keyring is locked. Unlock it, then try again",
  win32: "Windows Credential Manager is locked. Sign in to Windows, then try again",
};

const missing: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "No macOS keychain in this session. Run envden from a logged-in user session",
  linux: "No Secret Service on this Linux machine. Install or start gnome-keyring, then try again",
  win32:
    "Windows Credential Manager isn't available in this session. Sign in to Windows, then try again",
};

function isLocked(cause: Error) {
  if ("code" in cause && typeof cause.code === "string" && lockedCodes.includes(cause.code))
    return true;

  return /locked|interaction.*not allowed/i.test(cause.message);
}

// Names the cause and the next step for an OS keychain failure, when it's recognisable.
export function keychainAdvice(cause: unknown, platform: NodeJS.Platform): string | undefined {
  if (!(cause instanceof Error)) return undefined;

  if (isLocked(cause))
    return locked[platform] ?? "The OS keychain is locked. Unlock it, then try again";

  if (keychainUnavailable(cause))
    return (
      missing[platform] ??
      "No OS keychain on this machine. Set ENVDEN_KEYCHAIN=file before setup or join"
    );

  return undefined;
}
