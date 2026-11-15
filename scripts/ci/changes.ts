import { appendFileSync } from "node:fs";
import { spawnTrusted } from "@envden/core/process";
import { touchesBinary } from "./paths.ts";

const [base = "", head = ""] = process.argv.slice(2);

// A missing or all-zero base makes git fail, which runs everything.
const diff = spawnTrusted("git", ["diff", "--name-only", base, head], { sync: true });
const paths = (diff.stdout?.toString() ?? "").split("\n").filter(Boolean);
const binary = diff.exitCode !== 0 || touchesBinary(paths);

console.log(`binary=${binary} (${paths.length} changed paths)`);

appendFileSync(process.env.GITHUB_OUTPUT ?? "/dev/null", `binary=${binary}\n`);
