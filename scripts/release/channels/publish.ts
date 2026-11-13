import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { isMissingFile, publicationAction, repositoryFiles } from "./options.ts";
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
  readme?: string;
}) {
  const { repository, file, rendered, version, directory, dryRun, readme } = options;

  await command(
    "gh",
    ["repo", "clone", repository, directory, "--", "--depth", "1"],
    dirname(directory),
  );

  await writeOutput(join(directory, file), await readFile(rendered, "utf8"));
  const files = await writeRepositoryReadme(directory, file, readme);

  if (publicationAction(dryRun, "") === "preview") {
    await previewRepository(directory, files);

    return;
  }

  await command("git", ["add", "--", ...files], directory);
  const diff = await command("git", ["diff", "--cached", "--name-only"], directory);

  if (publicationAction(false, diff) === "unchanged") {
    console.log(`${repository} already has envden ${version}`);

    return;
  }

  await command("git", ["commit", "-m", `envden ${version}`], directory);
  await command("git", ["push", "origin", "HEAD"], directory);
  console.log(`Published envden ${version} to ${repository}`);
}

async function readmeExists(directory: string) {
  try {
    await access(join(directory, "README.md"));

    return true;
  } catch (error) {
    if (!isMissingFile(error)) throw error;

    return false;
  }
}

async function writeRepositoryReadme(directory: string, file: string, readme: string | undefined) {
  const exists = readme === undefined || (await readmeExists(directory));
  const files = repositoryFiles(file, readme, exists);

  if (files.includes("README.md") && readme !== undefined) {
    await writeOutput(join(directory, "README.md"), readme);
  }

  return files;
}

async function previewRepository(directory: string, files: string[]) {
  for (const path of files) {
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
}
