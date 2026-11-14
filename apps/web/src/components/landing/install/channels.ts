import { SITE_URL } from "@/lib/site.ts";

const SHELL = `curl -fsSL ${SITE_URL}/install.sh | sh`;
const BREW = "brew install notsuhas/tap/envden";

export const INSTALL_CHANNELS = [
  { id: "macos", label: "macOS", commands: [SHELL, BREW] },
  { id: "linux", label: "Linux", commands: [SHELL, BREW] },
  {
    id: "windows",
    label: "Windows",
    commands: [
      `irm ${SITE_URL}/install.ps1 | iex`,
      "scoop bucket add envden https://github.com/notsuhas/scoop-bucket; scoop install envden",
    ],
  },
  {
    id: "docker",
    label: "Docker",
    commands: [
      "docker run -d --name envden --restart unless-stopped -e TS_AUTHKEY=tskey-auth-... -v envden-data:/data -v tailscale-state:/var/lib/tailscale ghcr.io/notsuhas/envden:0.1",
      "docker logs envden",
    ],
  },
];

export function defaultChannel(userAgent: string): number {
  if (/windows/iu.test(userAgent)) return 2;

  if (/linux/iu.test(userAgent) && !/android/iu.test(userAgent)) return 1;

  return 0;
}
