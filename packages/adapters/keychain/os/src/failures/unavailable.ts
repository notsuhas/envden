export function keychainUnavailable(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  if (/locked|denied|cancel|interaction.*not allowed/i.test(cause.message)) return false;

  return /unavailable|not available|not supported|not implemented|org\.freedesktop\.secrets|libsecret|dbus|d-bus|secret service|errSecNotAvailable|credential manager.*(?:unavailable|not running)/i.test(
    cause.message,
  );
}
