import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { command } from "./commands.ts";
import { publishRepository, writeOutput } from "./publish.ts";
import { parseChecksums, renderNpmPackage, renderTemplate } from "./render.ts";

const root = resolve(import.meta.dir, "../../..");

const templates = [
  "homebrew/envden.rb",
  "scoop/envden.json",
  "winget/notsuhas.envden.yaml",
  "winget/notsuhas.envden.installer.yaml",
  "winget/notsuhas.envden.locale.en-US.yaml",
  "npm/checksums.json",
  "npm/package.json",
];

export async function downloadChecksums(version: string, directory: string) {
  try {
    await command(
      "gh",
      [
        "release",
        "download",
        `v${version}`,
        "--repo",
        "notsuhas/envden",
        "--pattern",
        "SHA256SUMS",
        "--dir",
        directory,
      ],
      root,
    );
  } catch (cause) {
    throw new Error(
      `Could not download SHA256SUMS for notsuhas/envden v${version}. Check that the release exists and gh is authenticated.`,
      { cause },
    );
  }
}

export async function renderFiles(version: string, directory: string, dryRun: boolean) {
  const renderedDirectory = join(directory, "rendered");
  const hashes = parseChecksums(await readFile(join(directory, "SHA256SUMS"), "utf8"));

  for (const file of templates) {
    const template = await readFile(join(root, "packaging", file), "utf8");

    const contents =
      file === "npm/package.json"
        ? renderNpmPackage(template, version)
        : renderTemplate(template, version, hashes);

    const output = join(renderedDirectory, file);
    await writeOutput(output, contents);

    if (dryRun)
      console.log(
        await command(
          "git",
          ["diff", "--no-index", "--", join(root, "packaging", file), output],
          root,
          true,
        ),
      );
  }
}

export async function writeWinget(version: string, renderedDirectory: string, dryRun: boolean) {
  const wingetDirectory = join(root, "packaging", "dist", "winget", version);

  if (!dryRun) {
    for (const file of templates.filter((file) => file.startsWith("winget/"))) {
      await writeOutput(
        join(wingetDirectory, file.slice("winget/".length)),
        await readFile(join(renderedDirectory, file), "utf8"),
      );
    }
  }

  return wingetDirectory;
}

export async function publishChannels(version: string, directory: string, dryRun: boolean) {
  const renderedDirectory = join(directory, "rendered");

  await publishRepository({
    repository: "notsuhas/homebrew-tap",
    file: "Formula/envden.rb",
    rendered: join(renderedDirectory, "homebrew/envden.rb"),
    version,
    directory: join(directory, "homebrew-tap"),
    dryRun,
  });

  await publishRepository({
    repository: "notsuhas/scoop-bucket",
    file: "bucket/envden.json",
    rendered: join(renderedDirectory, "scoop/envden.json"),
    version,
    directory: join(directory, "scoop-bucket"),
    dryRun,
    readme:
      "# Scoop bucket\n\nInstall envden:\n\n```powershell\nscoop bucket add notsuhas https://github.com/notsuhas/scoop-bucket\nscoop install notsuhas/envden\n```\n",
  });
}
