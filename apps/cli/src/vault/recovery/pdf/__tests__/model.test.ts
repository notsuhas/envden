import { expect, test } from "bun:test";
import { SITE_URL } from "@envden/core/site";

import { kitDocument } from "../model.ts";
import { kit } from "./kit.ts";

test("kit document holds the kit, its device and how to use it", () => {
  const document = kitDocument(kit, new Date("2026-11-15T12:00:00Z"), "laptop");

  expect(document).toEqual({
    title: "envden Recovery Kit",
    details: [
      { label: "Created", value: expect.stringMatching(/^2026-11-15 \d\d:\d\d /) },
      { label: "Device", value: "laptop" },
    ],
    fields: [
      { label: "Vault ID", value: kit.vaultId },
      { label: "Secret key", value: kit.secretKey, large: true },
      { label: "Server", value: kit.server },
    ],
    instructions: [
      `To get back in on a new device: run envden join ${kit.server} --recovery, enter the vault ID and secret key above, then your master password.`,
      "Keep this offline, like a passport. Never write your master password on it.",
      "Anyone with this kit and your master password can open the vault.",
    ],
    footer: SITE_URL,
  });
});
