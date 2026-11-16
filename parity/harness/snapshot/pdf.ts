import { spawnSync } from "node:child_process";
import type { Normalizer } from "../normalize.ts";

export function pdfText(bytes: Buffer, n: Normalizer) {
  const executable = Bun.which("pdftotext");
  if (!executable) throw new Error("PDF text extraction requires pdftotext from Poppler");

  const result = spawnSync(executable, ["-enc", "UTF-8", "-", "-"], {
    input: bytes,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });

  if (result.error || result.status !== 0)
    throw new Error("PDF text extraction failed; install pdftotext", { cause: result.error });

  const text = result.stdout.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("PDF has no extracted text");

  return { pdfText: n.text(text) };
}
