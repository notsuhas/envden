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

function document(text: string, gap = 0) {
  const stream = `BT /F1 12 Tf 30 700 Td ${gap} Tc (${text}) Tj ET`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = ["0000000000 65535 f "];

  for (const [index, object] of objects.entries()) {
    offsets.push(`${String(pdf.length).padStart(10, "0")} 00000 n `);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xref = pdf.length;
  pdf += `xref\n0 6\n${offsets.join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return Buffer.from(pdf);
}

test("PDF geometry can differ while changed fields and instructions fail", () => {
  const extract = (text: string, gap = 0) =>
    pdfText(document(text, gap), new Normalizer("/tmp/parity"));

  const text = "Vault ID: vault-a Secret key: secret-a Server: example.com Keep offline";
  expect(extract(text, 0.01)).toEqual(extract(text));

  for (const [before, after] of [
    ["vault-a", "vault-b"],
    ["secret-a", "secret-b"],
    ["example.com", "other.com"],
    ["Vault ID", "Device ID"],
    ["offline", "online"],
  ])
    expect(extract(text.replace(before!, after!))).not.toEqual(extract(text));
});
