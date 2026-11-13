import { readFile } from "node:fs/promises";
import { join } from "node:path";

// the site is built from apps/web, so the installers are two folders up
const INSTALL_DIR = join(process.cwd(), "..", "..", "packaging", "install");

export async function installScriptResponse(name: string): Promise<Response> {
  const script = await readFile(join(INSTALL_DIR, name), "utf8");

  return new Response(script, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
