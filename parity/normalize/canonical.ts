import { authenticatedText } from "./authenticated.ts";
import { createHash } from "node:crypto";
import { isLiteralFile } from "./literal.ts";

interface ISymbol {
  value: string;
  group: string;
  first: number;
}

function isLiteralContent(key: string): boolean {
  return key.endsWith(":content") && isLiteralFile(key.slice(0, -8));
}

function compare(a: string, b: string): number {
  if (a === b) return 0;

  return a < b ? -1 : 1;
}

function replacer(labels: Map<string, string>): (text: string) => string {
  const pattern = [...labels.keys()]
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const regex = new RegExp(pattern, "g");

  return (text) => (pattern ? text.replace(regex, (s) => labels.get(s)!) : text);
}

function render(entries: [string, string][], labels: Map<string, string>): [string, string][] {
  const substitute = replacer(labels);

  return entries
    .map(([key, value]): [string, string] => {
      const name = substitute(key);
      let text = isLiteralContent(key) ? value : substitute(value);

      if (key.endsWith(":authenticated")) text = authenticatedText(text);

      if (key.endsWith(":db")) {
        const tables: { rows: string[] }[] = JSON.parse(text);
        for (const table of tables) table.rows.sort();
        text = JSON.stringify(tables, null, 2);
      }

      return [name, text];
    })
    .sort(([a, av], [b, bv]) => compare(a, b) || compare(av, bv));
}

export function canonicalize(
  observations: Record<string, string>,
  symbols: ISymbol[],
  structures: string[],
): Record<string, string> {
  if (!symbols.length) return observations;

  const stripHashes = replacer(
    new Map(
      structures.map((structure) => [
        `${structure} sha256:${createHash("sha256").update(structure).digest("hex")}`,
        `${structure} sha256:STRUCTURE`,
      ]),
    ),
  );

  const entries = Object.entries(observations).map(([key, value]): [string, string] => [
    key,
    isLiteralContent(key) ? value : stripHashes(value),
  ]);

  const kinds = replacer(new Map(symbols.map(({ value }) => [value, "<IDENTITY>"])));
  const initial = symbols.map(({ group }) => kinds(group));

  function refine(colors: string[]): string[] {
    for (;;) {
      const signatures = symbols.map((symbol, i) => {
        const labels = new Map(
          symbols.map(({ value }, j) => [value, j === i ? "<SELF>" : `<COLOR:${colors[j]}>`]),
        );

        const context = render(entries, labels).filter(
          ([key, value]) => key.includes("<SELF>") || value.includes("<SELF>"),
        );

        return JSON.stringify([colors[i], replacer(labels)(symbol.group), context]);
      });

      const ranks = new Map([...new Set(signatures)].sort().map((s, i) => [s, String(i)]));
      const refined = signatures.map((s) => ranks.get(s)!);
      const before = new Set(colors).size;
      colors = refined;
      if (new Set(colors).size === before) return colors;
    }
  }

  function search(colors: string[]): [string, string][] {
    colors = refine(colors);

    const cells = new Map<string, number[]>();
    for (const [i, color] of colors.entries()) cells.set(color, [...(cells.get(color) ?? []), i]);

    const tied = [...cells.entries()]
      .sort(([a], [b]) => compare(a, b))
      .map(([, cell]) => cell)
      .find((cell) => cell.length > 1);

    if (tied) {
      let best: [string, string][] | undefined;

      const graph = [
        ...entries,
        ...symbols.map(({ value, group }): [string, string] => [`symbol:${value}`, group]),
      ];

      const identities = new Map(symbols.map(({ value }) => [value, value]));
      const original = JSON.stringify(render(graph, identities));
      const classes: number[][] = [];

      for (const i of tied) {
        const equivalent = classes.find(
          (cell) =>
            JSON.stringify(
              render(
                graph,
                new Map([
                  ...identities,
                  [symbols[i]!.value, symbols[cell[0]!]!.value],
                  [symbols[cell[0]!]!.value, symbols[i]!.value],
                ]),
              ),
            ) === original,
        );

        if (equivalent) equivalent.push(i);
        else classes.push([i]);
      }

      for (const cell of classes) {
        const individualized = colors.map(
          (color, j) => `${color}:${cell.includes(j) ? `chosen:${cell.indexOf(j)}` : "rest"}`,
        );

        const candidate = search(individualized);
        if (!best || JSON.stringify(candidate) < JSON.stringify(best)) best = candidate;
      }

      return best!;
    }

    return label(colors);
  }

  function label(colors: string[]): [string, string][] {
    const counts = new Map<string, number>();
    const labels = new Map<string, string>();

    const ordered = symbols
      .map((symbol, i) => ({ ...symbol, color: colors[i]! }))
      .sort(
        (a, b) =>
          a.group.split("<").length - b.group.split("<").length || compare(a.color, b.color),
      );

    for (const symbol of ordered) {
      const group = replacer(labels)(symbol.group);
      const next = counts.get(group) ?? symbol.first;
      counts.set(group, next + 1);
      labels.set(symbol.value, `<${group}#${next}>`);
    }

    return render(entries, labels);
  }

  return Object.fromEntries(
    search(initial).map(([key, value]) => [
      key,
      isLiteralContent(key)
        ? value
        : value.replace(
            /(<(?:[^<>\n]|<[^<>\n]*>)*#\d+>) sha256:STRUCTURE/g,
            (_, structure: string) =>
              `${structure} sha256:${createHash("sha256").update(structure).digest("hex")}`,
          ),
    ]),
  );
}
