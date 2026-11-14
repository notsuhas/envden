import { validateTag } from "./policy/version.ts";

const manifests = await Promise.all(
  ["cli", "server"].map((app) => Bun.file(`apps/${app}/package.json`).json()),
);

validateTag(
  process.env.GITHUB_REF_NAME ?? "",
  manifests.map((manifest) => manifest.version),
);
