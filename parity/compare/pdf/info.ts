import { pdfTokens, type IPdfToken } from "../pdf-strings.ts";

export function pdfInfo(source: string, objects: Map<string, string>): Record<string, string> {
  const info: Record<string, string> = {};
  const reference = /\/Info\s+(\d+)\s+(\d+)\s+R/.exec(source);

  const dictionary = reference
    ? objects.get(`${reference[1]} ${reference[2]}`)
    : /\/Info\s*(<<[\s\S]*?>>)/.exec(source)?.[1];

  if (reference && !dictionary) throw new Error("Missing PDF Info object");
  if (dictionary) readFields(pdfTokens(dictionary), objects, info);

  return Object.fromEntries(Object.entries(info).sort(([a], [b]) => a.localeCompare(b)));
}

function readFields(
  tokens: IPdfToken[],
  objects: Map<string, string>,
  info: Record<string, string>,
) {
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i]!;
    if (key.kind !== "word" || !key.value.startsWith("/")) continue;
    const value = tokens[++i];
    if (!value) throw new Error("Missing PDF Info field");
    if (["/CreationDate", "/ModDate", "/ID", "/Creator", "/Producer"].includes(key.value)) continue;
    const field = fieldValue(tokens, i, objects);
    info[key.value] = field.value;
    i += field.skip;
  }
}

function fieldValue(tokens: IPdfToken[], i: number, objects: Map<string, string>) {
  const value = tokens[i]!;
  const ref = tokens[i + 1];

  if (value.kind === "word" && ref && tokens[i + 2]?.value === "R") {
    const indirect = objects.get(`${value.value} ${ref.value}`);
    if (!indirect) throw new Error("Missing PDF Info field object");
    const values = pdfTokens(indirect);
    if (values.length !== 1) throw new Error("Unsupported PDF Info field object");

    return { value: values[0]!.value, skip: 2 };
  }

  return { value: value.value, skip: 0 };
}
