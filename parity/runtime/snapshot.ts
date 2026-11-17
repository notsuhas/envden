import { verifyRetained } from "./integrity/collect.ts";
import { semanticJson } from "./integrity/objects.ts";
import { orderJson } from "../normalize/json.ts";
import { pdfContent } from "../compare/pdf.ts";
import { readDatabase } from "./sqlite/reader.ts";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
import type { Normalizer } from "../normalize/normalizer.ts";
import { isLiteralFile } from "../normalize/literal.ts";
import { isForeignCache } from "./foreign.ts";

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function dump(path: string, normalizer: Normalizer): unknown {
  return readDatabase(path, (db) => {
    const tables = db
      .query<{ name: string; sql: string }, []>(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all();

    return tables.map(({ name, sql }) => {
      const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${quote(name)})`).all();

      const selected = columns.map(
        ({ name: column }, i) => `typeof(${quote(column)}) AS ${quote(`__parity_type_${i}`)}`,
      );

      const rows = db
        .query<Record<string, unknown>, []>(`SELECT *, ${selected.join(",")} FROM ${quote(name)}`)
        .all()
        .map((row) =>
          columns.map(({ name: key }, i) => {
            const value = row[key];
            const type = row[`__parity_type_${i}`];
            if (value === null) return [key, "null", null];

            if (value instanceof Uint8Array) {
              const device = row.device;

              const scope =
                name === "nonces" && key === "nonce" && device instanceof Uint8Array
                  ? `NONCE:${normalizer.bytes(device)}`
                  : undefined;

              return [key, "blob", value.length, normalizer.bytes(value, scope)];
            }

            if (typeof value === "string") return [key, "text", normalizer.text(value)];

            if (typeof value === "number" || typeof value === "bigint")
              return [key, type, normalizer.text(String(value))];

            throw new Error("Unsupported SQLite value");
          }),
        );

      return { name, sql, rows: rows.map((row) => JSON.stringify(row)).sort() };
    });
  });
}

export async function snapshot(
  root: string,
  normalizer: Normalizer,
  canonical = true,
  validated?: Map<string, unknown>,
): Promise<Record<string, string>> {
  const verified = validated ?? (await verifyRetained(root));

  const canonicalize = normalizer.canonicalizer();
  const result: Record<string, string> = {};

  async function walk(path: string, relative: string): Promise<void> {
    const stat = await lstat(path);
    const name = normalizer.text(relative);
    result[`${name}:mode`] = (stat.mode & 0o7777).toString(8);

    if (stat.isSymbolicLink()) {
      result[`${name}:link`] = normalizer.text(await readlink(path));

      return;
    }

    if (stat.isDirectory()) {
      result[`${name}:type`] = "directory";

      for (const item of (await readdir(path)).sort())
        await walk(join(path, item), `${relative}/${item}`);

      return;
    }

    if (!stat.isFile()) {
      result[`${name}:type`] = "special";

      return;
    }

    if (isForeignCache(relative)) {
      result[`${name}:type`] = "foreign-cache";

      return;
    }

    await fileSnapshot(path, relative, name, normalizer, result);
  }

  async function seed(path: string): Promise<void> {
    const stat = await lstat(path);

    if (stat.isDirectory()) {
      for (const item of (await readdir(path)).sort()) await seed(join(path, item));
    } else if (stat.isFile() && path.endsWith(".sqlite")) dump(path, normalizer);
  }

  for (const [path, value] of verified) {
    const name = normalizer.text(path.slice(root.length + 1).replace(/\/\d+(?=\/|$)/g, "/row"));
    const key = `${name}:authenticated`;
    const valueText = normalizer.text(semanticJson(value));

    result[key] = [result[key], valueText]
      .filter(Boolean)
      .sort((a, b) => (a! < b! ? -1 : a! > b! ? 1 : 0))
      .join("\n");
  }

  await seed(root);
  for (const item of (await readdir(root)).sort()) await walk(join(root, item), item);

  return canonical ? canonicalize(result) : result;
}

async function fileSnapshot(
  path: string,
  relative: string,
  name: string,
  normalizer: Normalizer,
  result: Record<string, string>,
): Promise<void> {
  const bytes = await readFile(path);

  if (path.endsWith(".pdf")) {
    result[`${name}:pdf`] = normalizer.text(JSON.stringify(pdfContent(bytes)));
  } else if (bytes.subarray(0, 16).toString() === "SQLite format 3\x00") {
    result[`${name}:db`] = JSON.stringify(dump(path, normalizer), null, 2);
  } else if (
    bytes.includes(0) ||
    new TextDecoder("utf8", { fatal: false }).decode(bytes).includes("\uFFFD")
  ) {
    result[`${name}:binary`] = normalizer.bytes(bytes);
  } else {
    const text = bytes.toString("utf8");

    result[`${name}:content`] = isLiteralFile(relative)
      ? text
      : normalizer.text(path.endsWith(".json") ? jsonText(text) : text);
  }
}

function jsonText(text: string): string {
  try {
    return JSON.stringify(orderJson(JSON.parse(text)));
  } catch {
    return text;
  }
}
