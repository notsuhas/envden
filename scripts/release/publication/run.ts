import { command } from "../channels/commands.ts";
import { publishRelease } from "./publish.ts";

const tag = process.env.GITHUB_REF_NAME;
const repository = process.env.GH_REPO;

if (!tag || !repository) throw new Error("GITHUB_REF_NAME and GH_REPO required");

await publishRelease({
  tag,
  repository,
  highest: process.env.HIGHEST === "true",
  directory: process.cwd(),
  gh: (args) => command("gh", args, process.cwd()),
});
