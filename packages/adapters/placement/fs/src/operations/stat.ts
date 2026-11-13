import { lstat } from "node:fs/promises";

export async function statOrMissing(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return undefined;

    throw error;
  }
}
