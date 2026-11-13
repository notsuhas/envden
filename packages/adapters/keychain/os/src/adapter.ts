import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IKeychainAdapter } from "@envden/core/adapters";

interface IOptions {
  home?: string;
  fileOnly?: boolean;
}

class OsKeychainAdapter implements IKeychainAdapter {
  readonly id = "os";
  private readonly directory: string;
  private useFile: boolean;

  constructor(options: IOptions = {}) {
    this.directory = join(
      options.home ?? process.env.ENVDEN_HOME ?? join(homedir(), ".envden"),
      "state",
      "keys",
    );

    this.useFile = options.fileOnly ?? false;
  }

  private options(name: string) {
    return { service: "envden", name };
  }

  private path(name: string) {
    return join(this.directory, `${Buffer.from(name).toString("hex")}.key`);
  }

  async available() {
    if (this.useFile) return false;
    const name = `probe-${crypto.randomUUID()}`;

    try {
      await Bun.secrets.set({
        ...this.options(name),
        value: "probe",
        ...(process.platform === "win32" ? { persist: "local" as const } : {}),
      });

      await Bun.secrets.delete(this.options(name));

      return true;
    } catch {
      this.useFile = true;

      return false;
    }
  }

  async get(name: string): Promise<Uint8Array | undefined> {
    if (!this.useFile) {
      try {
        const value = await Bun.secrets.get(this.options(name));
        if (value !== null) return Buffer.from(value, "base64");
      } catch {
        this.useFile = true;
      }
    }

    try {
      return new Uint8Array(await readFile(this.path(name)));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async set(name: string, value: Uint8Array) {
    if (!this.useFile) {
      try {
        await Bun.secrets.set({
          ...this.options(name),
          value: Buffer.from(value).toString("base64"),
          ...(process.platform === "win32" ? { persist: "local" as const } : {}),
        });

        await rm(this.path(name), { force: true });

        return;
      } catch {
        this.useFile = true;
      }
    }

    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const temporary = join(this.directory, `${crypto.randomUUID()}.tmp`);

    try {
      await writeFile(temporary, value, { mode: 0o600, flag: "wx" });
      await rename(temporary, this.path(name));
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async delete(name: string) {
    if (!this.useFile) {
      try {
        await Bun.secrets.delete(this.options(name));
      } catch {
        throw new Error("Keychain unavailable; key deletion could not be confirmed");
      }
    }

    await rm(this.path(name), { force: true });
  }
}

export function createOsKeychainAdapter(options: IOptions = {}): IKeychainAdapter {
  return new OsKeychainAdapter(options);
}
