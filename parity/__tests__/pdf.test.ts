import { expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { pdfContent } from "../compare/pdf.ts";
import { pdfTokens } from "../compare/pdf-strings.ts";

function pdf(content: string, title = "Recovery", date = "today", compressed = true): Buffer {
  const stream = compressed ? deflateSync(content) : Buffer.from(content);

  return Buffer.concat([
    Buffer.from(
      `%PDF-1.7\n1 0 obj\n<< /Length ${stream.length} ${compressed ? "/Filter /FlateDecode" : ""} >>\nstream\n`,
    ),
    stream,
    Buffer.from(
      `\nendstream\nendobj\n2 0 obj\n<< /Title (${title}) /Author (envden) /CreationDate (${date}) /ModDate (${date}) >>\nendobj\ntrailer << /Info 2 0 R /ID [(random)] >>\n%%EOF`,
    ),
  ]);
}

test("PDF compression, layout, string encoding and dates may differ", () => {
  const a = pdf("BT 12 Tf (Hello\\040world) Tj [(safe) -10 ( kit)] TJ ET");

  const b = pdf(
    "BT 14 Tf <48656c6c6f20776f726c64> Tj (safe kit) Tj ET",
    "Recovery",
    "tomorrow",
    false,
  );

  expect(pdfContent(a)).toEqual(pdfContent(b));

  expect(pdfContent(a)).toEqual({
    text: ["Hello world", "safe kit"],
    info: { "/Author": "envden", "/Title": "Recovery" },
  });
});

test("PDF text, text order and Info fields must match", () => {
  const a = pdfContent(pdf("(one) Tj (two) Tj"));
  expect(a).not.toEqual(pdfContent(pdf("(one) Tj (three) Tj")));
  expect(a).not.toEqual(pdfContent(pdf("(two) Tj (one) Tj")));
  expect(a).not.toEqual(pdfContent(pdf("(one) Tj (two) Tj", "Other")));
});

test("PDF reads every FlateDecode stream and rejects corrupt streams", () => {
  const a = pdf("(first) Tj");
  const b = pdf("(second) Tj");
  expect(pdfContent(Buffer.concat([a, b])).text).toEqual(["first", "second"]);

  expect(() =>
    pdfContent(
      Buffer.from(
        "%PDF-1.7\n1 0 obj << /Filter /FlateDecode /Length 3 >>\nstream\nbad\nendstream\nendobj",
      ),
    ),
  ).toThrow();
});

test("PDF strings support nesting, escapes, octal, hex and UTF-16BE", () => {
  expect(
    pdfTokens("(a(b)c\\)\\\\\\n) <FEFF00410042> <414> (line\\\njoin)").map((token) => token.value),
  ).toEqual(["a(b)c)\\\n", "AB", "A@", "linejoin"]);
});

test("PDF snapshots keep names and modes exact while comparing content", async () => {
  const { mkdtemp, mkdir, writeFile, chmod, rename, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { snapshot } = await import("../runtime/snapshot.ts");
  const { Normalizer } = await import("../normalize/normalizer.ts");
  const root = await mkdtemp(join(tmpdir(), "parity-pdf-"));

  try {
    const a = join(root, "a");
    const b = join(root, "b");
    await mkdir(a);
    await mkdir(b);
    await writeFile(join(a, "kit.pdf"), pdf("(kit) Tj"), { mode: 0o600 });

    await writeFile(join(b, "kit.pdf"), pdf("(kit) Tj", "Recovery", "later", false), {
      mode: 0o600,
    });

    const expected = await snapshot(a, new Normalizer());
    expect(await snapshot(b, new Normalizer())).toEqual(expected);
    await chmod(join(b, "kit.pdf"), 0o644);
    expect(await snapshot(b, new Normalizer())).not.toEqual(expected);
    await chmod(join(b, "kit.pdf"), 0o600);
    await rename(join(b, "kit.pdf"), join(b, "other.pdf"));
    expect(await snapshot(b, new Normalizer())).not.toEqual(expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
