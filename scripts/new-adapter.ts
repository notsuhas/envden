import { join, relative, resolve } from "node:path";
import { generateAdapter } from "./adapter/generate.ts";

const [kind, impl] = process.argv.slice(2);

if (!kind || !impl) {
  console.error("Usage: bun scripts/new-adapter.ts <kind> <impl>");
  process.exit(2);
}

const root = resolve(import.meta.dir, "..");
const target = await generateAdapter(root, join(root, "packaging/templates/adapter"), kind, impl);

console.log(`Created ${relative(root, target)}. Run bun install, then follow docs/adapters.md.`);
