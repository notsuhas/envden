import { test, expect } from "bun:test";
import { keychainUnavailable } from "../failures/unavailable.ts";

for (const [message, unavailable] of [
  ["The name org.freedesktop.secrets was not provided by any .service files", true],
  ["Cannot autolaunch D-Bus without X11 $DISPLAY", true],
  ["libsecret could not connect", true],
  ["errSecNotAvailable", true],
  ["No keychain is available. You may need to restart your computer.", true],
  ["A default keychain could not be found.", true],
  ["The name is not activatable", true],
  ["Could not connect: No such file or directory", true],
  ["A specified logon session does not exist. It may already have been terminated.", true],
  ["Credential Manager is unavailable", true],
  ["User interaction is not allowed", false],
  ["No user interaction allowed", false],
  ["Secret Service is locked", false],
  ["access denied", false],
  ["user cancelled", false],
  ["unexpected failure", false],
] as const)
  test(`classify ${message}`, () => {
    expect(keychainUnavailable(new Error(message))).toBe(unavailable);
  });

for (const code of [
  "ERR_SECRETS_INTERACTION_NOT_ALLOWED",
  "ERR_SECRETS_AUTH_FAILED",
  "ERR_SECRETS_INTERACTION_REQUIRED",
  "ERR_SECRETS_USER_CANCELED",
])
  test(`structured denial wins over message: ${code}`, () => {
    expect(
      keychainUnavailable(Object.assign(new Error("No keychain is available"), { code })),
    ).toBe(false);
  });
