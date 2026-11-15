import { withDocsVersion } from "./version/docs.ts";

const { version } = await Bun.file("apps/cli/package.json").json();

const npm = await Bun.file("packaging/npm/package.json").json();

await Bun.write("packaging/npm/package.json", JSON.stringify({ ...npm, version }, null, 2) + "\n");

const docsPath = "apps/web/content/docs/getting-started/index.mdx";

await Bun.write(docsPath, withDocsVersion(await Bun.file(docsPath).text(), version));
