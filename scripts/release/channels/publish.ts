import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { publicationAction } from "./options.ts";
import { command } from "./commands.ts";

export async function writeOutput(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

export async function publishRepository(options: {
  repository: string;
  file: string;
  rendered: string;
  version: string;
  directory: string;
  dryRun: boolean;
}) {
  const { repository, file, rendered, version, directory, dryRun } = options;

  await command(
    "gh",
    ["repo", "clone", repository, directory, "--", "--depth", "1"],
    dirname(directory),
  );

  await writeOutput(join(directory, file), await readFile(rendered, "utf8"));

  if (publicationAction(dryRun, "") === "preview") {
    await previewRepository(directory, file);

    return;
  }

  await command("git", ["add", "--", file], directory);
  const diff = await command("git", ["diff", "--cached", "--name-only"], directory);

  if (publicationAction(false, diff) === "unchanged") {
    console.log(`${repository} already has envden ${version}`);

    return;
  }

  await command("git", ["commit", "-m", `envden ${version}`], directory);
  await command("git", ["push", "origin", "HEAD"], directory);
  console.log(`Published envden ${version} to ${repository}`);
}

async function previewRepository(directory: string, path: string) {
  const original = await command("git", ["show", `HEAD:${path}`], directory).catch(() => "");
  const before = join(directory, ".git", "envden-before");
  await writeFile(before, original);

  console.log(
    await command(
      "git",
      ["diff", "--no-index", "--", before, join(directory, path)],
      directory,
      true,
    ),
  );
}
