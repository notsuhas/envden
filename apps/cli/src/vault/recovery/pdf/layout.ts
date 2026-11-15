import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  breakTextIntoLines,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type { IKitDocument } from "./model.ts";

interface IFonts {
  regular: PDFFont;
  bold: PDFFont;
  code: PDFFont;
}

interface IPen {
  page: PDFPage;
  fonts: IFonts;
}

const MARGIN = 64;
const PADDING = 20;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.55, 0.55, 0.6);

export async function renderKit(document: IKitDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(document.title);

  const page = pdf.addPage(PageSizes.A4);

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    code: await pdf.embedFont(StandardFonts.Courier),
  };

  const pen = { page, fonts };
  let y = page.getHeight() - MARGIN;

  y = drawHeader(pen, document, y);
  y = drawFields(pen, document, y - 28);
  drawInstructions(pen, document, y - 28);
  drawFooter(pen, document);

  // Without object streams older PDF readers can open the file too.
  return pdf.save({ useObjectStreams: false });
}

function drawHeader({ page, fonts }: IPen, document: IKitDocument, top: number) {
  let y = top - 24;
  write(page, document.title, MARGIN, y, fonts.bold, 24);

  y -= 10;

  for (const detail of document.details) {
    y -= 15;
    write(page, detail.label, MARGIN, y, fonts.bold, 10, MUTED);
    write(page, detail.value, MARGIN + 56, y, fonts.regular, 10);
  }

  return y;
}

function drawFields({ page, fonts }: IPen, document: IKitDocument, top: number) {
  const width = page.getWidth() - MARGIN * 2;
  const inner = width - PADDING * 2;

  const rows = document.fields.map((field) => ({
    ...field,
    size: fitSize(field.value, fonts.code, field.large ? 18 : 12, inner),
  }));

  const height = PADDING * 2 + rows.reduce((sum, row) => sum + 9 + 8 + row.size, 0) + 18 * 2;

  page.drawRectangle({
    x: MARGIN,
    y: top - height,
    width,
    height,
    borderColor: RULE,
    borderWidth: 1,
  });

  let y = top - PADDING;

  for (const row of rows) {
    y -= 9;
    write(page, row.label.toUpperCase(), MARGIN + PADDING, y, fonts.bold, 9, MUTED);

    y -= 8 + row.size;
    write(page, row.value, MARGIN + PADDING, y, fonts.code, row.size);

    y -= 18;
  }

  return top - height;
}

function drawInstructions({ page, fonts }: IPen, document: IKitDocument, top: number) {
  const width = page.getWidth() - MARGIN * 2;
  let y = top;

  for (const paragraph of document.instructions) {
    const text = printable(paragraph, fonts.regular);
    const measure = (part: string) => fonts.regular.widthOfTextAtSize(part, 11);

    for (const line of breakTextIntoLines(text, [" "], width, measure)) {
      y -= 16;
      write(page, line.trim(), MARGIN, y, fonts.regular, 11);
    }

    y -= 8;
  }
}

function drawFooter({ page, fonts }: IPen, document: IKitDocument) {
  const width = fonts.regular.widthOfTextAtSize(document.footer, 9);
  write(page, document.footer, (page.getWidth() - width) / 2, MARGIN, fonts.regular, 9, MUTED);
}

function write(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
) {
  page.drawText(printable(text, font), { x, y, font, size, color });
}

function fitSize(text: string, font: PDFFont, preferred: number, width: number) {
  return Math.min(preferred, width / Math.max(font.widthOfTextAtSize(text, 1), 1));
}

// Standard fonts only cover WinAnsi; anything else (emoji, CJK, controls) would make pdf-lib throw.
function printable(text: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());

  return text.replace(/./gsu, (char) => (supported.has(char.codePointAt(0)!) ? char : "?"));
}
