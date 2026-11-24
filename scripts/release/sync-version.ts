import { withDocsVersion } from "./version/docs.ts";

const { version } = await Bun.file("apps/cli/package.json").json();

const docsPath = "apps/web/content/docs/getting-started/index.mdx";

await Bun.write(docsPath, withDocsVersion(await Bun.file(docsPath).text(), version));
