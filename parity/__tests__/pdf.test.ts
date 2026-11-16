import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { pdfText } from "../harness/snapshot/pdf.ts";
import { Normalizer } from "../harness/normalize.ts";

test("PDF comparison extracts fields and text independently of metadata", () => {
  const bytes = readFileSync(new URL("../fixtures/recovery-pdf/kit.pdf", import.meta.url));
  const extract = (input: Buffer) => pdfText(input, new Normalizer("/tmp/parity"));
  const original = extract(bytes);
  expect(original.pdfText).toContain("VAULT ID");
  expect(original.pdfText).toContain("SECRET KEY");
  expect(original.pdfText).toContain("SERVER");
  expect(original.pdfText).toContain("laptop");
  expect(original.pdfText).toContain("<secret:1:38>");

  expect(extract(Buffer.concat([bytes, Buffer.from("\n% different metadata\n")]))).toEqual(
    original,
  );

  expect(() => extract(Buffer.from("not a pdf"))).toThrow("PDF text extraction failed");
});

test("human timestamps and kit filenames normalize without hiding prose changes", () => {
  const n = new Normalizer("/tmp/parity");
  expect(n.text("4 seconds ago (2026-11-16 00:51 GMT+5:30)")).toBe("<RELATIVE_TIME> (<TIME>)");
  expect(n.text("envden Recovery Kit ABC123.pdf")).toBe(n.text("envden Recovery Kit ABC123.pdf"));

  expect(n.text("envden Recovery Kit ABC123.pdf")).not.toBe(
    n.text("envden Recovery Kit DEF456.pdf"),
  );
});
