import { keychainUnavailable } from "./failures/unavailable.ts";
import { keychainFailure } from "./failures/operation.ts";
import { EnvdenError } from "@envden/core/errors";
import { readFile } from "node:fs/promises";
import { hasFileSource, writeKeyFile, removeKeyFile, durableWrite } from "./files/source.ts";
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
  private readonly fileOnly: boolean;
  private fallbackNotice = false;
  private reported = false;

  constructor(options: IOptions = {}) {
    this.directory = join(
      options.home ?? process.env.ENVDEN_HOME ?? join(homedir(), ".envden"),
      "state",
      "keys",
    );

    this.fileOnly = options.fileOnly ?? false;
  }

  private options(name: string) {
    return { service: "envden", name };
  }

  private path(name: string) {
    return join(this.directory, `${Buffer.from(name).toString("hex")}.key`);
  }

  takeFallbackNotice() {
    if (!this.fallbackNotice || this.reported) return false;
    this.reported = true;

    return true;
  }

  async available() {
    if (this.fileOnly) return false;
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
      return false;
    }
  }

  private async fileValue(name: string) {
    try {
      return new Uint8Array(await readFile(this.path(name)));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  private marker() {
    return join(this.directory, "os.file");
  }

  private async markOs() {
    if (!(await hasFileSource(join(this.directory, "os"))))
      await durableWrite(this.marker(), new Uint8Array());
  }

  private async readOs(name: string, required = false) {
    try {
      const value = await Bun.secrets.get(this.options(name));
      if (value !== null) await this.markOs().catch(() => {});

      return value;
    } catch (cause) {
      if (
        required ||
        !keychainUnavailable(cause) ||
        (await hasFileSource(join(this.directory, "os")))
      )
        throw new EnvdenError("LOCKED", "Vault keys unavailable", { cause });

      return null;
    }
  }

  async get(name: string, required = false): Promise<Uint8Array | undefined> {
    const file = await this.fileValue(name);
    if (file !== undefined) return file;

    if (this.fileOnly) {
      if (required)
        throw new EnvdenError(
          "LOCKED",
          "Device keys are in the OS keychain; disable file-only mode",
        );

      return undefined;
    }

    if (await hasFileSource(this.path(name))) return undefined;

    const value = await this.readOs(name, required);

    return value === null ? undefined : new Uint8Array(Buffer.from(value, "base64"));
  }

  async set(name: string, value: Uint8Array) {
    if (!(await this.fileBacked(name))) {
      const existing = await this.readOs(name);

      try {
        await Bun.secrets.set({
          ...this.options(name),
          value: Buffer.from(value).toString("base64"),
          ...(process.platform === "win32" ? { persist: "local" as const } : {}),
        });

        await durableWrite(this.marker(), new Uint8Array());

        return;
      } catch (cause) {
        if (
          existing !== null ||
          !keychainUnavailable(cause) ||
          (await hasFileSource(join(this.directory, "os")))
        )
          throw cause;

        this.fallbackNotice = true;
      }
    }

    await writeKeyFile(this.path(name), value);
  }

  private async fileBacked(name: string) {
    return (
      this.fileOnly ||
      (await hasFileSource(this.path(name))) ||
      (await this.fileValue(name)) !== undefined
    );
  }

  async delete(name: string) {
    const fileSource =
      (await hasFileSource(this.path(name))) || (await this.fileValue(name)) !== undefined;

    try {
      if (!this.fileOnly) await Bun.secrets.delete(this.options(name));
    } catch (cause) {
      if (!keychainUnavailable(cause) || (await hasFileSource(join(this.directory, "os"))))
        throw new EnvdenError(
          "LOCKED",
          "Keychain unavailable; key deletion could not be confirmed",
          { cause },
        );
    }

    if (fileSource) await removeKeyFile(this.path(name));
  }
}

export function createOsKeychainAdapter(options: IOptions = {}): IKeychainAdapter {
  const adapter = new OsKeychainAdapter(options);

  return {
    id: adapter.id,
    takeFallbackNotice: () => adapter.takeFallbackNotice(),
    available: () => adapter.available().catch(keychainFailure),
    get: (name, required) => adapter.get(name, required).catch(keychainFailure),
    set: (name, value) => adapter.set(name, value).catch(keychainFailure),
    delete: (name) => adapter.delete(name).catch(keychainFailure),
  };
}
