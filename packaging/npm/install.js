import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repo = "REPLACE_GITHUB_OWNER/REPLACE_GITHUB_REPO";

if (repo.includes("REPLACE")) throw new Error("Configure release repository before publishing");

const metadata = JSON.parse(await readFile(new URL("package.json", import.meta.url), "utf8"));
const hashes = JSON.parse(await readFile(new URL("checksums.json", import.meta.url), "utf8"));

let platform = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;

if (process.platform === "linux" && !process.report.getReport().header.glibcVersionRuntime)
  platform += "-musl";

const expected = hashes[platform];

if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected))
  throw new Error("Missing pinned platform checksum");

const asset = `envden-${platform}${process.platform === "win32" ? ".exe" : ""}`;

const response = await fetch(
  `https://github.com/${repo}/releases/download/v${metadata.version}/${asset}`,
  { signal: AbortSignal.timeout(120000) },
);

if (!response.ok) throw new Error("Binary download failed");

const bytes = Buffer.from(await response.arrayBuffer());

if (createHash("sha256").update(bytes).digest("hex") !== expected)
  throw new Error("Checksum mismatch");

const directory = new URL("native/", import.meta.url);

await mkdir(directory, { recursive: true });

const destination = fileURLToPath(
  new URL(process.platform === "win32" ? "envden.exe" : "envden", directory),
);

await writeFile(`${destination}.tmp`, bytes);

await chmod(`${destination}.tmp`, 0o755);

await rename(`${destination}.tmp`, destination);
