import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { command } from "./commands.ts";
import { publishRepository, writeOutput } from "./publish.ts";
import { parseChecksums, renderTemplate } from "./render.ts";

const root = resolve(import.meta.dir, "../../..");

const formula = "homebrew/envden.rb";

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

    parseChecksums(await readFile(join(directory, "SHA256SUMS"), "utf8"));
  } catch (cause) {
    throw new Error(
      `Could not download release checksums for notsuhas/envden v${version}. Check that the release exists and gh is authenticated.`,
      { cause },
    );
  }
}

export async function renderFormula(version: string, directory: string, dryRun: boolean) {
  const hashes = parseChecksums(await readFile(join(directory, "SHA256SUMS"), "utf8"));
  const template = await readFile(join(root, "packaging", formula), "utf8");
  const output = join(directory, "rendered", formula);

  await writeOutput(output, renderTemplate(template, version, hashes));

  if (dryRun)
    console.log(
      await command(
        "git",
        ["diff", "--no-index", "--", join(root, "packaging", formula), output],
        root,
        true,
      ),
    );
}

export async function publishFormula(version: string, directory: string, dryRun: boolean) {
  await publishRepository({
    repository: "notsuhas/homebrew-tap",
    file: "Formula/envden.rb",
    rendered: join(directory, "rendered", formula),
    version,
    directory: join(directory, "homebrew-tap"),
    dryRun,
  });
}
