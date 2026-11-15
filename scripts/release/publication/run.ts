import { command } from "../channels/commands.ts";
import { readFile } from "node:fs/promises";
import { releaseNotes } from "./notes.ts";
import { publishRelease } from "./publish.ts";

const tag = process.env.GITHUB_REF_NAME;
const repository = process.env.GH_REPO;

if (!tag || !repository) throw new Error("GITHUB_REF_NAME and GH_REPO required");

await publishRelease({
  tag,
  repository,
  highest: process.env.HIGHEST === "true",
  macosSigned: process.env.MACOS_SIGNING === "true",
  directory: process.cwd(),
  notes: releaseNotes(
    await readFile("apps/cli/CHANGELOG.md", "utf8"),
    tag.replace(/^v/, ""),
    repository,
  ),
  gh: (args) => command("gh", args, process.cwd()),
});
