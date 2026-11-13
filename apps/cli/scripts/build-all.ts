import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

await mkdir(join(root, "dist"), { recursive: true });

for (const platform of ["darwin", "linux", "windows"]) {
  for (const arch of ["x64", "arm64"]) {
    const target = `bun-${platform}-${arch}`;
    const child = Bun.spawn(
      [
        "bun",
        "build",
        "--compile",
        "--no-compile-autoload-dotenv",
        "--no-compile-autoload-bunfig",
        `--target=${target}`,
        join(root, "src/main.ts"),
        "--outfile",
        join(root, "dist", `envden-${platform}-${arch}${platform === "windows" ? ".exe" : ""}`),
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    if ((await child.exited) !== 0) throw new Error(`Build failed: ${target}`);
  }
}
