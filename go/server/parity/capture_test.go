package parity

const captureScript = `import { plugin } from "bun";
import { readFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";

const root = process.cwd();
const helper = process.env.ENVDEN_CAPTURE_HELPER;
const captureDir = process.env.ENVDEN_CAPTURE_DIR ?? root + "/go/server/testdata/parity";

mkdirSync(captureDir, { recursive: true });

for (const name of readdirSync(captureDir))
  if (/^[0-9]{4}\.(json|sqlite.gz)$/.test(name)) unlinkSync(captureDir + "/" + name);

plugin({
  name: "server-reference-capture",
  setup(build) {
    build.onLoad({ filter: /apps\/server\/src\/middleware\/body-budget\.ts$/ }, ({ path }) => ({
      contents:
        readFileSync(path, "utf8").replace(
          "export function createBodyBudget",
          "function originalBudget",
        ) +
        ` + "`" + `\nimport { budget } from "${helper}"; export function createBodyBudget(){return budget(originalBudget());}` + "`" + `,
      loader: "ts",
    }));

    build.onLoad({ filter: /apps\/server\/src\/adapters\.ts$/ }, ({ path }) => ({
      contents:
        readFileSync(path, "utf8").replace(
          "export function createAdapters",
          "function originalAdapters",
        ) +
        ` + "`" + `\nimport { remember } from "${helper}"; export function createAdapters(...args) { const result=originalAdapters(...args);remember(result.storage,args[0]);return result; }` + "`" + `,
      loader: "ts",
    }));

    build.onLoad({ filter: /apps\/server\/src\/app\.ts$/ }, ({ path }) => ({
      contents:
        readFileSync(path, "utf8").replace("export function createApp", "function referenceApp") +
        ` + "`" + `\nimport { wrap } from "${helper}"; export function createApp(...args) { return wrap(referenceApp(...args),...args); }` + "`" + `,
      loader: "ts",
    }));
  },
});
`
