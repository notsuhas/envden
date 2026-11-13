import { SITE_URL } from "@/lib/site.ts";

export const INSTALL_CHANNELS = [
  { id: "curl", label: "curl", commands: [`curl -fsSL ${SITE_URL}/install.sh | sh`] },
  { id: "irm", label: "irm", commands: [`irm ${SITE_URL}/install.ps1 | iex`] },
  { id: "brew", label: "brew", commands: ["brew install notsuhas/tap/envden"] },
  { id: "npm", label: "npm", commands: ["npm i -g envden"] },
  {
    id: "scoop",
    label: "scoop",
    commands: [
      "scoop bucket add envden https://github.com/notsuhas/scoop-bucket",
      "scoop install envden",
    ],
  },
  { id: "docker", label: "docker", commands: ["docker pull ghcr.io/notsuhas/envden:0.1"] },
];

export function defaultChannel(userAgent: string): number {
  return /windows/iu.test(userAgent) ? 1 : 0;
}
