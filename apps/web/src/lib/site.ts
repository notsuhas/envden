import { version } from "@envden/cli/package.json";
import { SITE_URL } from "@envden/core/site";

export { SITE_URL };

export const SITE_NAME = "envden";

export const SITE_TAGLINE =
  "Push, pull and merge your .env files across every machine you own, like Git. Encrypted on your device and stored on a server you run, which can't read them.";

export const GITHUB_URL = "https://github.com/notsuhas/envden";

export const AUTHOR = { name: "Suhas Siriprole", shortName: "Suhas", url: "https://notsuhas.dev" };

export const ADAPTERS_GUIDE_URL = `${GITHUB_URL}/blob/main/docs/adapters.md`;

export const ENVDEN_VERSION = version;

export const ALPHA_BANNER = `${SITE_NAME} v${ENVDEN_VERSION} is in alpha`;
