import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyReleaseChecksums } from "./verify.ts";

export async function publishRelease(options: {
  tag: string;
  repository: string;
  highest: boolean;
  macosSigned: boolean;
  directory: string;
  notes: string;
  gh: (args: string[]) => Promise<string>;
}) {
  const { tag, repository, highest, macosSigned, directory, notes, gh } = options;

  const release = findRelease(
    JSON.parse(await gh(["api", "--paginate", "--slurp", `repos/${repository}/releases`])),
    tag,
  );

  const builds = join(directory, "release");
  const published = join(directory, "published");

  if (release && !release.draft) {
    await mkdir(published, { recursive: true });
    await gh(["release", "download", tag, "--pattern", "SHA256SUMS", "--dir", published]);

    verifyReleaseChecksums(
      await readFile(join(published, "SHA256SUMS"), "utf8"),
      await readFile(join(builds, "SHA256SUMS"), "utf8"),
      macosSigned,
    );

    return;
  }

  const notesFile = join(directory, "release-notes.md");
  await writeFile(notesFile, notes);

  if (!release)
    await gh([
      "release",
      "create",
      tag,
      "--draft",
      "--verify-tag",
      "--title",
      tag,
      "--notes-file",
      notesFile,
    ]);

  const files = await readdir(builds);
  await gh(["release", "upload", tag, ...files.map((file) => join(builds, file)), "--clobber"]);
  await gh(["release", "edit", tag, "--draft=false", `--latest=${highest}`]);
}

function findRelease(value: unknown, tag: string): { draft: boolean } | undefined {
  if (!Array.isArray(value) || !value.every(Array.isArray)) throw new Error("Invalid release list");
  const releases: unknown[] = value.flat();

  for (const item of releases) {
    const record = releaseRecord(item);

    if (record.tag_name === tag) return { draft: record.draft };
  }

  return undefined;
}

function releaseRecord(item: unknown): { tag_name: string; draft: boolean } {
  if (
    typeof item !== "object" ||
    item === null ||
    !("tag_name" in item) ||
    !("draft" in item) ||
    typeof item.tag_name !== "string" ||
    typeof item.draft !== "boolean"
  )
    throw new Error("Invalid release record");

  return { tag_name: item.tag_name, draft: item.draft };
}
