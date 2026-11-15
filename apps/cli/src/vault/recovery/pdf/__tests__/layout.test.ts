import { expect, test } from "bun:test";

import { renderKit } from "../layout.ts";
import { kitDocument } from "../model.ts";
import { kit } from "./kit.ts";
import { pdfText } from "./text.ts";

test("rendered kit shows every part of the document", async () => {
  const document = kitDocument(kit, new Date("2026-11-15T12:00:00Z"), "laptop");
  const text = await pdfText(await renderKit(document));

  for (const part of [
    document.title,
    ...document.details.map((detail) => detail.value),
    ...document.fields.flatMap((field) => [field.label.toUpperCase(), field.value]),
    ...document.instructions,
    document.footer,
  ])
    expect(text).toContain(part);
});

test("characters the standard fonts lack render as a question mark", async () => {
  const document = kitDocument(kit, new Date(0), "laptop 🚀 ノート");

  expect(await pdfText(await renderKit(document))).toContain("laptop ? ???");
});
