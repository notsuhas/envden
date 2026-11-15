import type { Context } from "./context.ts";
import { Normalizer } from "./normalize.ts";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";
import { Database } from "bun:sqlite";

async function children(path: string, n: Normalizer) {
  const order = await Promise.all(
    (await readdir(path)).map(async (child) => {
      const file = join(path, child);
      const stat = await lstat(file);
      const bytes = stat.isFile() ? await readFile(file) : Buffer.alloc(0);
      const random = /^(?:[a-f0-9]{64}\.key|\.envden-backup-|[0-9]{13}[-_])/.test(child);

      return {
        child,
        order: random ? `${bytes.length}:${bytes.toString("utf8")}` : n.known(child),
      };
    }),
  );

  return order
    .sort((a, b) => a.order.localeCompare(b.order))
    .map((item) => item.child)
    .filter((name) => name !== ".git");
}

function textContents(text: string, n: Normalizer) {
  try {
    return n.value(JSON.parse(text));
  } catch {
    return n.text(text);
  }
}

async function contents(path: string, n: Normalizer) {
  const bytes = await readFile(path);
  if (/(?:^|\/)[^/]*\.env(?:\.|$)/.test(path)) return { exact: bytes.toString("base64") };
  if (path.endsWith(".key")) return { bytes: bytes.length };

  if (!Buffer.from(bytes.toString("utf8")).equals(bytes))
    return { bytes: bytes.length, version: bytes[0] };

  return textContents(bytes.toString("utf8"), n);
}

async function walk(path: string, name: string, n: Normalizer): Promise<unknown[]> {
  const stat = await lstat(path);
  const entry = { path: n.text(name), mode: (stat.mode & 0o7777).toString(8) };
  if (stat.isSymbolicLink()) return [{ ...entry, link: n.text(await readlink(path)) }];
  if (!stat.isDirectory()) return [{ ...entry, content: await contents(path, n) }];
  const entries: unknown[] = [{ ...entry, directory: true }];

  for (const child of await children(path, n))
    entries.push(...(await walk(join(path, child), `${name}/${child}`, n)));

  return entries;
}

function missing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function seed(root: string, n: Normalizer) {
  try {
    n.value(JSON.parse(await readFile(join(root, "state", "device.json"), "utf8")));
  } catch (error) {
    if (!missing(error)) throw error;
  }
}

export async function tree(root: string, n: Normalizer): Promise<unknown[]> {
  await seed(root, n);

  return walk(root, ".", n).catch((error: unknown) => {
    if (missing(error)) return [];
    throw error;
  });
}

export function database(path: string, n: Normalizer) {
  const db = new Database(path, { readonly: true });

  try {
    const schema = db
      .query<{ type: string; name: string; sql: string }, []>(
        "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name",
      )
      .all();

    const tables = schema
      .filter((entry) => entry.type === "table")
      .map(({ name }) => {
        const rows = db.query(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all();
        const normalized = rows.map((row) => n.value(row));

        return {
          name,
          rows:
            name === "nonces"
              ? [...new Map(normalized.map((row) => [JSON.stringify(row), row])).values()]
              : normalized,
        };
      });

    return { schema, tables };
  } finally {
    db.close();
  }
}

export async function capture(c: Context) {
  const n = new Normalizer(
    c.root,
    Object.values(c.commands).map((command) => command[0]!),
  );

  const steps = c.results.map((step) => ({
    ...step,
    label: n.text(step.label),
    stdout: n.text(step.stdout),
    stderr: n.text(step.stderr),
  }));

  const files: Record<string, unknown> = {};

  for (const [role, device] of c.devices) {
    files[role] = {
      userHome: await tree(device.home, n),
      home: await tree(device.env.ENVDEN_HOME!, n),
    };
  }

  const databases = [];

  for (const server of c.servers) {
    const paths = await readdir(server.data);

    for (const path of paths.filter((name) => /\.(sqlite|db)$/.test(name)).sort())
      databases.push({ role: server.role, name: path, ...database(join(server.data, path), n) });
  }

  return JSON.stringify({ steps, files, databases }, null, 2);
}
