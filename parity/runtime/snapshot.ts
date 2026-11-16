import { Database } from "bun:sqlite";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
import type { Normalizer } from "../normalize/normalizer.ts";
import { isForeignCache } from "./foreign.ts";

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function dump(path: string, normalizer: Normalizer): unknown {
  const db = new Database(path, { readonly: true, safeIntegers: true });

  try {
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

              return [key, "blob", value.length, normalizer.hashStructure(value, scope)];
            }

            if (typeof value === "string") return [key, "text", normalizer.text(value)];

            if (typeof value === "number" || typeof value === "bigint")
              return [key, type, normalizer.text(String(value))];

            throw new Error("Unsupported SQLite value");
          }),
        );

      return { name, sql, rows: rows.map((row) => JSON.stringify(row)).sort() };
    });
  } finally {
    db.close();
  }
}

export async function snapshot(
  root: string,
  normalizer: Normalizer,
): Promise<Record<string, string>> {
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

      for (const item of (await readdir(path)).sort((a, b) =>
        normalizer.text(a).localeCompare(normalizer.text(b)),
      ))
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

  await seed(root);
  for (const item of (await readdir(root)).sort()) await walk(join(root, item), item);

  return result;
}

async function fileSnapshot(
  path: string,
  relative: string,
  name: string,
  normalizer: Normalizer,
  result: Record<string, string>,
): Promise<void> {
  const bytes = await readFile(path);

  if (bytes.subarray(0, 16).toString() === "SQLite format 3\x00") {
    result[`${name}:db`] = JSON.stringify(dump(path, normalizer), null, 2);
  } else if (
    bytes.includes(0) ||
    new TextDecoder("utf8", { fatal: false }).decode(bytes).includes("\uFFFD")
  ) {
    result[`${name}:binary`] = normalizer.hashStructure(bytes);
  } else {
    const text = bytes.toString("utf8");

    result[`${name}:content`] =
      /(?:^|\/)\.env(?:\.[^/]*)?$/.test(relative) || relative.endsWith("shared.env")
        ? text
        : normalizer.text(text);
  }
}
