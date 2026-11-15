import { spawnTrusted } from "@envden/core/process";
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const installer = resolve(import.meta.dir, "../../../../packaging/install/install.sh");

if (process.platform !== "win32") {
  test("shell installer rejects invalid versions before downloading", async () => {
    for (const version of ["Latest", "v1.2.3-rc.1", "v01.2.3", "1.2.3", "v1.2.3\nv2.3.4"]) {
      const result = spawnTrusted("sh", [installer], {
        sync: true,
        env: { ...process.env, ENVDEN_VERSION: version },
      });

      expect(result.exitCode).toBe(2);
      expect(result.stderr?.toString()).toContain("ENVDEN_VERSION");
    }
  });

  test.each([true, false])("shell installer checksum accepted: %s", async (valid) => {
    const root = await mkdtemp(join(tmpdir(), "envden-installer-"));
    const mocks = join(root, "mocks");
    const bin = join(root, "bin");
    const home = join(root, "state");
    const log = join(root, "curl.log");
    const binary = "test binary\n";
    const hash = new Bun.CryptoHasher("sha256").update(binary).digest("hex");

    try {
      await mkdir(mocks);

      await writeFile(
        join(mocks, "uname"),
        '#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo x86_64;; esac\n',
        { mode: 0o755 },
      );

      await writeFile(join(mocks, "ldd"), "#!/bin/sh\necho glibc\n", { mode: 0o755 });

      await writeFile(
        join(mocks, "curl"),
        `#!/bin/sh
printf '%s\\n' "$@" >> "$CURL_LOG"
while [ "$#" -gt 0 ]; do
  case "$1" in https:*) url=$1;; -o) shift; output=$1;; esac
  shift
done
case "$url" in
  */SHA256SUMS) printf '%s  envden-linux-x64\\n' '${valid ? hash : "0".repeat(64)}' > "$output";;
  *) printf 'test binary\\n' > "$output";;
esac
`,
        { mode: 0o755 },
      );

      const result = spawnTrusted(
        "sh",
        ["-c", 'PATH="$MOCK_PATH:$PATH"; export PATH; exec sh "$INSTALL_SCRIPT"'],
        {
          sync: true,
          env: {
            ...process.env,
            MOCK_PATH: mocks,
            INSTALL_SCRIPT: installer,
            ENVDEN_VERSION: "v1.2.3",
            ENVDEN_INSTALL_DIR: bin,
            ENVDEN_HOME: home,
            CURL_LOG: log,
          },
        },
      );

      if (!valid) {
        expect(result.exitCode).toBe(1);
        expect(result.stderr?.toString()).toContain("mismatch");
        expect(await Bun.file(join(bin, "envden")).exists()).toBe(false);

        return;
      }

      expect(result.exitCode).toBe(0);
      expect(await readFile(join(bin, "envden"), "utf8")).toBe(binary);
      expect(await readFile(join(home, "install-method"), "utf8")).toBe("script");
      const args = await readFile(log, "utf8");
      expect(args).toContain("--connect-timeout\n15\n--retry\n3");
      expect(args).toContain("--proto-redir\n=https");
      expect(args).toContain("/download/v1.2.3/");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

if (process.platform === "win32") {
  test("PowerShell installer validates versions and installs into a custom directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-installer-"));
    const bin = join(root, "bin");
    const home = join(root, "state");
    const script = installer.replace("install.sh", "install.ps1");
    const harness = join(root, "harness.ps1");

    try {
      await writeFile(
        harness,
        `
function Invoke-WebRequest {
  param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile)
  if ($Uri.EndsWith('/SHA256SUMS')) {
    $hash = (Get-FileHash (Join-Path (Split-Path $OutFile) "envden-windows-$env:PROCESSOR_ARCHITECTURE.exe") -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($OutFile, "$hash  envden-windows-$env:PROCESSOR_ARCHITECTURE.exe")
  } else { [IO.File]::WriteAllText($OutFile, 'test binary') }
}
$env:PROCESSOR_ARCHITECTURE = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
& $env:INSTALL_SCRIPT
`,
      );

      for (const version of [
        "V1.2.3",
        "Latest",
        "v1.2.3-rc.1",
        "v01.2.3",
        "v1.2.3oops",
        "1.2.3",
        "v1.2.3\n",
        "v1.2.3",
      ]) {
        const result = spawnTrusted(
          join(process.env.PROGRAMFILES ?? "C:/Program Files", "PowerShell", "7", "pwsh.exe"),
          ["-NoProfile", "-File", harness],
          {
            sync: true,
            env: {
              ...process.env,
              INSTALL_SCRIPT: script,
              ENVDEN_VERSION: version,
              ENVDEN_INSTALL_DIR: bin,
              ENVDEN_HOME: home,
            },
          },
        );

        if (version !== "v1.2.3") {
          expect(result.exitCode).not.toBe(0);
          expect(result.stderr?.toString()).toContain("Invalid ENVDEN_VERSION");
        } else {
          expect(result.exitCode).toBe(0);
          expect(await readFile(join(bin, "envden.exe"), "utf8")).toBe("test binary");
          expect(await readFile(join(home, "install-method"), "utf8")).toBe("script");
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
