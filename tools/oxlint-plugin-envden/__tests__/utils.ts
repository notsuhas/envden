import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(createRequire(import.meta.url).resolve("vite-plus/package.json"));
const oxlint = join(dirname(require.resolve("oxlint/package.json")), "bin/oxlint");

export function runFixture(rule: string, files: Record<string, string>, fix = false) {
  const directory = mkdtempSync(join(import.meta.dirname, ".fixtures-"));

  try {
    for (const [filename, source] of Object.entries(files)) {
      const path = join(directory, filename);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, source);
    }

    const config = join(directory, ".oxlintrc.json");

    writeFileSync(
      config,
      JSON.stringify({
        categories: { correctness: "off" },
        jsPlugins: [{ name: "envden", specifier: resolve(import.meta.dirname, "../index.ts") }],
        rules: { [`envden/${rule}`]: "error" },
      }),
    );

    const result = spawnSync(
      "node",
      [
        oxlint,
        "--config",
        config,
        "--format",
        "json",
        "--no-ignore",
        ...(fix ? ["--fix"] : []),
        ...Object.keys(files).map((file) => join(directory, file)),
      ],
      { encoding: "utf8" },
    );

    if (result.error || result.signal)
      throw result.error ?? new Error(`Oxlint terminated: ${result.signal}\n${result.stderr}`);

    const output: unknown = JSON.parse(result.stdout);

    if (
      !output ||
      typeof output !== "object" ||
      !("diagnostics" in output) ||
      !Array.isArray(output.diagnostics)
    ) {
      throw new Error(`Invalid oxlint response: ${result.stdout}\n${result.stderr}`);
    }

    const diagnostics = output.diagnostics.filter(
      (diagnostic: unknown) =>
        diagnostic &&
        typeof diagnostic === "object" &&
        "code" in diagnostic &&
        diagnostic.code === `envden(${rule})`,
    );

    if (output.diagnostics.length !== diagnostics.length)
      throw new Error(`Unexpected diagnostics: ${result.stdout}`);

    if (result.status !== 0 && diagnostics.length === 0) {
      throw new Error(
        `Oxlint failed without a rule diagnostic: ${result.stdout}\n${result.stderr}`,
      );
    }

    return {
      diagnostics,
      files: Object.fromEntries(
        Object.keys(files).map((file) => [file, readFileSync(join(directory, file), "utf8")]),
      ),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Lets one oxlint run serve several cases: each case reads only its own file's diagnostics.
export function diagnosticsFor(diagnostics: { filename: string }[], file: string) {
  return diagnostics.filter((diagnostic) => diagnostic.filename.endsWith(`/${file}`));
}
