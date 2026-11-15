import { expect, test } from "bun:test";
import { keychainAdvice } from "../failures/advice.ts";

for (const [message, platform, advice] of [
  [
    "User interaction is not allowed.",
    "darwin",
    /^macOS keychain is locked.*security unlock-keychain/,
  ],
  ["Secret Service is locked", "linux", /keyring is locked/],
  [
    "The name org.freedesktop.secrets was not provided by any .service files",
    "linux",
    /^No Secret Service.*gnome-keyring/,
  ],
  ["A default keychain could not be found.", "darwin", /^No macOS keychain/],
  ["A specified logon session does not exist.", "win32", /Credential Manager isn't available/],
  ["not supported", "freebsd", /ENVDEN_KEYCHAIN=file/],
  ["unexpected failure", "darwin", undefined],
] as const)
  test(`advice for ${platform}: ${message}`, () => {
    const result = keychainAdvice(new Error(message), platform);

    if (advice) expect(result).toMatch(advice);
    else expect(result).toBeUndefined();
  });

test("structured lock codes win over the message", () => {
  const cause = Object.assign(new Error("No keychain is available"), {
    code: "ERR_SECRETS_INTERACTION_NOT_ALLOWED",
  });

  expect(keychainAdvice(cause, "darwin")).toStartWith("macOS keychain is locked");
});
