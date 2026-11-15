import { version } from "@envden/cli/package.json";
import { SITE_URL } from "@envden/core/site";

export { SITE_URL };

export const SITE_NAME = "envden";

export const SITE_TAGLINE =
  "Sync whole .env files across your own machines, end-to-end encrypted, through a server you host, over Tailscale.";

export const GITHUB_URL = "https://github.com/notsuhas/envden";

export const ENVDEN_VERSION = version;

export const ALPHA_BANNER = `${SITE_NAME} v${ENVDEN_VERSION} is in alpha`;
