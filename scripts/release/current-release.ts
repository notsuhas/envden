import { spawnTrusted } from "@envden/core/process";
import { appendFile } from "node:fs/promises";
import { isHighestRelease } from "./policy/version.ts";

const result = spawnTrusted(
  "gh",
  [
    "api",
    "--paginate",
    `repos/${process.env.GH_REPO}/releases`,
    "--jq",
    ".[] | select(.draft == false and .prerelease == false) | .tag_name",
  ],
  { sync: true, env: { GH_TOKEN: process.env.GH_TOKEN } },
);

if (result.exitCode !== 0 || !result.stdout) throw new Error("Could not list released versions");

const highest = isHighestRelease(
  process.env.GITHUB_REF_NAME ?? "",
  result.stdout.toString().trim().split("\n"),
);

const output = process.env.GITHUB_OUTPUT;

if (!output) throw new Error("GITHUB_OUTPUT required");

await appendFile(output, `highest=${highest}\n`);
