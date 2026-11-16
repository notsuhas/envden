import { expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { pdfText } from "../harness/snapshot/pdf.ts";
import { Normalizer } from "../harness/normalize.ts";

function fixture(text: string) {
  const compressed = deflateSync(Buffer.from(text));

  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`),
    compressed,
    Buffer.from("\nendstream\n%%EOF"),
  ]);
}

test("PDF comparison inflates text operators and detects changed kit instructions", () => {
  const n = new Normalizer("/tmp/parity");

  expect(pdfText(fixture("BT <5641554c54> Tj (keep offline) Tj ET"), n)).toEqual({
    pdfText: "VAULT\nkeep offline",
  });

  expect(pdfText(fixture("BT (keep online) Tj ET"), n)).not.toEqual(
    pdfText(fixture("BT (keep offline) Tj ET"), n),
  );

  expect(pdfText(fixture("(kit) Tj\n%15"), n)).toEqual({ pdfText: "kit" });

  expect(() => pdfText(fixture("q Q"), n)).toThrow("no decoded text operators");
});

test("human timestamps and kit filenames normalize without hiding prose changes", () => {
  const n = new Normalizer("/tmp/parity");
  expect(n.text("4 seconds ago (2026-11-16 00:51 GMT+5:30)")).toBe("<RELATIVE_TIME> (<TIME>)");
  expect(n.text("envden Recovery Kit ABC123.pdf")).toBe(n.text("envden Recovery Kit ABC123.pdf"));

  expect(n.text("envden Recovery Kit ABC123.pdf")).not.toBe(
    n.text("envden Recovery Kit DEF456.pdf"),
  );
});
