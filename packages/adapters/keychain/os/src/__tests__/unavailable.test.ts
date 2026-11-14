import { test, expect } from "bun:test";
import { keychainUnavailable } from "../failures/unavailable.ts";

for (const [message, unavailable] of [
  ["The name org.freedesktop.secrets was not provided by any .service files", true],
  ["Cannot autolaunch D-Bus without X11 $DISPLAY", true],
  ["libsecret could not connect", true],
  ["errSecNotAvailable", true],
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
