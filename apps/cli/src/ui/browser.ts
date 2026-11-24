import { spawnTrusted } from "@envden/core/process";

export function browserCommand(platform: NodeJS.Platform, url: string): string[] {
  if (platform === "darwin") return ["open", url];

  return ["xdg-open", url];
}

export async function openBrowser(url: string): Promise<boolean> {
  try {
    const child = spawnTrusted(browserCommand(process.platform, url), {
      stdout: "ignore",
      stderr: "ignore",
    });

    return (await child.exited) === 0;
  } catch {
    return false;
  }
}
