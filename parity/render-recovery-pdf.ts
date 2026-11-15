import { Font, Encodings } from "@pdf-lib/standard-fonts";
import { writeFile } from "node:fs/promises";
// oxlint-disable-next-line no-restricted-imports -- Render the frozen TypeScript reference for byte fixtures.
import { renderKit } from "../apps/cli/src/vault/recovery/pdf/layout.ts";
// oxlint-disable-next-line no-restricted-imports -- Build the frozen TypeScript reference document.
import { kitDocument } from "../apps/cli/src/vault/recovery/pdf/model.ts";
// oxlint-disable-next-line no-restricted-imports -- Use the frozen protocol for fixture identifiers.
import { encodeSecretKey, base32 } from "../packages/core/src/protocol/index.ts";

process.env.TZ = "UTC";

const fixedTime = 1800000000000;
const NativeDate = Date;

globalThis.Date = class extends NativeDate {
  constructor(value?: number | string) {
    super(value ?? fixedTime);
  }

  static override now() {
    return fixedTime;
  }
} as DateConstructor;

const kit = {
  vaultId: base32(new Uint8Array(32).fill(3)),
  secretKey: encodeSecretKey(new Uint8Array(16).fill(5)),
  server: "http://localhost:4310",
};

const document = kitDocument(kit, new Date(fixedTime), "laptop");

await writeFile(
  "parity/fixtures/recovery-pdf/kit.json",
  JSON.stringify({ kit, now: fixedTime, deviceName: "laptop", document }, null, 2),
);

await writeFile("parity/fixtures/recovery-pdf/kit.pdf", await renderKit(document));

const font = Font.load("Helvetica");
const encoding = Encodings.WinAnsi;

const mapping = Object.fromEntries(
  encoding.supportedCodePoints.map((point: number) => {
    const glyph = encoding.encodeUnicodeCodePoint(point);

    return [String.fromCodePoint(point), [glyph.code, font.getWidthOfGlyph(glyph.name)]];
  }),
);

const kern = Object.fromEntries(
  encoding.supportedCodePoints.flatMap((left: number) =>
    encoding.supportedCodePoints.flatMap((right: number) => {
      const amount = font.getXAxisKerningForPair(
        encoding.encodeUnicodeCodePoint(left).name,
        encoding.encodeUnicodeCodePoint(right).name,
      );

      return amount ? [[String.fromCodePoint(left, right), amount]] : [];
    }),
  ),
);

const suffixes = Array.from({ length: 1000 }, (_, index) => {
  const value = Math.sin(index + 1) * 10000;

  return Math.floor((value - Math.floor(value)) * 1e10);
});

await writeFile(
  "rust/cli/src/vault/recovery/pdf/metrics.json",
  JSON.stringify({ mapping, kern, suffixes }),
);

const longKit = { ...kit, server: "https://envden." + "long".repeat(25) + ".example.test" };
const longDevice = "café 💻 東京";

await writeFile(
  "parity/fixtures/recovery-pdf/long.json",
  JSON.stringify({ kit: longKit, now: fixedTime, deviceName: longDevice }, null, 2),
);

await writeFile(
  "parity/fixtures/recovery-pdf/long.pdf",
  await renderKit(kitDocument(longKit, new Date(fixedTime), longDevice)),
);
