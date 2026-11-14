export function keychainUnavailable(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;

  if (
    "code" in cause &&
    typeof cause.code === "string" &&
    [
      "ERR_SECRETS_INTERACTION_NOT_ALLOWED",
      "ERR_SECRETS_AUTH_FAILED",
      "ERR_SECRETS_INTERACTION_REQUIRED",
      "ERR_SECRETS_USER_CANCELED",
    ].includes(cause.code)
  )
    return false;

  if (/locked|denied|cancel|interaction.*not allowed/i.test(cause.message)) return false;

  return /no keychain is available|a default keychain could not be found|the name is not activatable|could not connect: no such file or directory|a specified logon session does not exist|unavailable|not available|not supported|not implemented|org\.freedesktop\.secrets|libsecret|dbus|d-bus|secret service|errSecNotAvailable|credential manager.*(?:unavailable|not running)/i.test(
    cause.message,
  );
}
