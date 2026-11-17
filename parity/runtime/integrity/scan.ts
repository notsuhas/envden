import { retainedFiles } from "./walk.ts";
import { database } from "./database.ts";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { check, type IRetained } from "./objects.ts";

export async function retained(root: string): Promise<IRetained[]> {
  const objects: IRetained[] = [];

  for await (const path of retainedFiles(root)) {
    const bytes = await readFile(path);

    if (path.includes("/state/headers/")) {
      check(createHash("sha256").update(bytes).digest("hex") === basename(path));
      objects.push({ path, kind: "manifest", bytes: Buffer.from(bytes.toString(), "base64url") });
    } else if (/\/blobs\/(?:[0-9a-f]{64}\/)?[0-9a-f]{64}$/.test(path)) {
      objects.push({ path, kind: "blob", bytes, hash: Buffer.from(basename(path), "hex") });
    } else if (path.endsWith("/state/device.json")) {
      await device(path, bytes, objects);
    } else if (bytes.subarray(0, 16).toString() === "SQLite format 3\x00") {
      database(path, objects);
    }
  }

  return objects;
}

async function device(path: string, bytes: Buffer, objects: IRetained[]): Promise<void> {
  const value = JSON.parse(bytes.toString());
  objects.push({ path: `${path}/cache`, kind: "cache", bytes });

  for (const [index, entry] of (value.entries ?? []).entries())
    objects.push({
      path: `${path}/entries/${index}`,
      kind: "entry",
      bytes: Buffer.from(entry, "base64url"),
    });

  for (const [index, header] of (value.headers ?? []).entries())
    objects.push({
      path: `${path}/headers/${index}`,
      kind: "manifest",
      bytes: Buffer.from(header, "base64url"),
    });

  for (const kind of ["keyring", "files"] as const) {
    if (!value[kind]) continue;

    objects.push({
      path: `${path}/${kind}`,
      kind,
      bytes: Buffer.from(value[kind], "base64url"),
    });
  }

  await headerReferences(path, value.headerRefs ?? []);
}

async function headerReferences(path: string, refs: string[]): Promise<void> {
  for (const ref of refs) {
    check(typeof ref === "string" && /^[0-9a-f]{64}$/.test(ref));
    const header = await readFile(join(path, "..", "headers", ref));
    check(createHash("sha256").update(header).digest("hex") === ref);
  }
}
