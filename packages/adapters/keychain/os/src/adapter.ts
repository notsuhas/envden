import { keychainFailure } from "./failures/operation.ts";
import { EnvdenError } from "@envden/core/errors";
import { mkdir, readFile, rename, rm, open } from "node:fs/promises";
import { restrictAccess } from "./permissions/private.ts";
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

    const value = await Bun.secrets.get(this.options(name));

    return value === null ? undefined : new Uint8Array(Buffer.from(value, "base64"));
  }

  async set(name: string, value: Uint8Array) {
    if (!this.fileOnly && (await this.fileValue(name)) === undefined) {
      const existing = await Bun.secrets.get(this.options(name));

      try {
        await Bun.secrets.set({
          ...this.options(name),
          value: Buffer.from(value).toString("base64"),
          ...(process.platform === "win32" ? { persist: "local" as const } : {}),
        });

        return;
      } catch (cause) {
        if (existing !== null) throw cause;
        this.fallbackNotice = true;
      }
    }

    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await restrictAccess(this.directory, true);
    const temporary = join(this.directory, `${crypto.randomUUID()}.tmp`);

    try {
      const file = await open(temporary, "wx", 0o600);

      try {
        await file.writeFile(value);
        await file.sync();
      } finally {
        await file.close();
      }

      await restrictAccess(temporary);
      await rename(temporary, this.path(name));

      if (process.platform !== "win32") {
        const directory = await open(this.directory, "r");

        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async delete(name: string) {
    if (!this.fileOnly && (await this.fileValue(name)) === undefined) {
      try {
        await Bun.secrets.delete(this.options(name));
      } catch {
        throw new EnvdenError(
          "INVALID_INPUT",
          "Keychain unavailable; key deletion could not be confirmed",
        );
      }
    }

    await rm(this.path(name), { force: true });
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
