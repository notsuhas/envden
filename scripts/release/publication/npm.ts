import { readFile } from "node:fs/promises";
import { verifyNpmChecksums } from "./verify.ts";

const [pinned, sums] = process.argv.slice(2);

if (!pinned || !sums) throw new Error("Usage: verify-npm.ts <checksums.json> <SHA256SUMS>");

verifyNpmChecksums(JSON.parse(await readFile(pinned, "utf8")), await readFile(sums, "utf8"));
