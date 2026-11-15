import { expect, test } from "bun:test";
import { SITE_URL } from "@envden/core/site";

import { kitDocument } from "../model.ts";
import { kit } from "./kit.ts";

test("kit document holds the kit, its device and how to use it", () => {
  const document = kitDocument(kit, new Date("2026-11-15T12:00:00Z"), "laptop");

  expect(document).toMatchObject({
    details: [{ value: expect.stringMatching(/^2026-11-15 \d\d:\d\d /) }, { value: "laptop" }],
    fields: [{ value: kit.vaultId }, { value: kit.secretKey, large: true }, { value: kit.server }],
    footer: SITE_URL,
  });

  expect(document.instructions.join(" ")).toContain(`envden join ${kit.server} --recovery`);
});
