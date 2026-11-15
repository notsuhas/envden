const COMMIT = /^- ([0-9a-f]{7,40}): /;
const DEPENDENCY = /^- @envden\//;

// the release body is that version's CHANGELOG section, with each entry linked to its commit
export function releaseNotes(changelog: string, version: string, repository: string): string {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) throw new Error(`apps/cli/CHANGELOG.md has no section for ${version}`);
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));

  const entries = lines
    .slice(start + 1, next === -1 ? undefined : next)
    .filter((line) => !DEPENDENCY.test(line.trim()))
    .map((line) => linkCommit(line, repository));

  const upgrade = [
    "",
    "### Upgrade",
    "",
    "```sh",
    "brew upgrade envden   # or: envden update",
    "```",
    "",
    `Full changelog: https://github.com/${repository}/blob/v${version}/apps/cli/CHANGELOG.md`,
  ];

  return (
    [...entries, ...upgrade]
      .join("\n")
      .replace(/^\n+/, "")
      .replace(/\n{3,}/g, "\n\n") + "\n"
  );
}

function linkCommit(line: string, repository: string) {
  const match = COMMIT.exec(line);
  if (!match) return line;

  const sha = match[1]!;

  return `- ${line.slice(match[0].length)} ([${sha}](https://github.com/${repository}/commit/${sha}))`;
}
