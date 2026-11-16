import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function differences(
  reference: Record<string, string>,
  candidate: Record<string, string>,
): Promise<string[]> {
  const diffs: string[] = [];
  const directory = await mkdtemp(join(tmpdir(), "envden-diff-"));

  try {
    for (const key of [...new Set([...Object.keys(reference), ...Object.keys(candidate)])].sort()) {
      if (reference[key] === candidate[key]) continue;
      const a = reference[key] ?? "<missing>";
      const b = candidate[key] ?? "<missing>";
      await writeFile(join(directory, "a"), a.endsWith("\n") ? a : `${a}\n`);
      await writeFile(join(directory, "b"), b.endsWith("\n") ? b : `${b}\n`);

      const proc = Bun.spawn(
        [
          "diff",
          "-u",
          "--label",
          `reference/${key}`,
          "--label",
          `candidate/${key}`,
          join(directory, "a"),
          join(directory, "b"),
        ],
        { stdout: "pipe", stderr: "pipe" },
      );

      const [output, error, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      if (code > 1) throw new Error(`diff failed: ${error}`);
      diffs.push(output);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  return diffs;
}
