import { defineConfig } from "vite-plus";

const CROSS_PACKAGE = {
  group: ["**/core/src/**", "**/testing/src/**", "**/adapters/*/*/src/**", "**/apps/*/src/**"],
  message: "Import another package by name (@envden/...), never by relative path.",
};

const ADAPTER_IMPORTS = {
  group: ["@envden/adapter-*", "@envden/cli", "@envden/server", "@envden/web"],
  message: "An adapter imports only @envden/core.",
};

export default defineConfig({
  staged: {
    "*": ["vp fmt --no-error-on-unmatched-pattern", "vp lint --no-error-on-unmatched-pattern"],
    "{*.{ts,tsx,mjs},package.json,.fallowrc.json}": () => "fallow --fail-on-issues",
  },
  fmt: {
    ignorePatterns: ["docs/**", "**/*.md", "apps/web/.source/**"],
  },
  lint: {
    plugins: ["typescript", "unicorn", "import"],
    jsPlugins: [{ name: "envden", specifier: "./tools/oxlint-plugin-envden/index.ts" }],
    options: {
      typeAware: true,
      typeCheck: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "envden/quality-policy": "error",
      "typescript/no-deprecated": "error",
      "envden/trusted-process": "error",
      "no-console": "off",
      "typescript/no-explicit-any": "error",
      "typescript/no-floating-promises": "error",
      "typescript/consistent-type-imports": "error",
      "max-lines": ["error", { max: 250, skipBlankLines: true, skipComments: true }],
      "eslint/no-restricted-imports": ["error", { patterns: [CROSS_PACKAGE] }],
      "envden/tests-in-tests-folder": "error",
      "envden/index-reexports-only": "error",
      "envden/type-name-prefix": "error",
      "envden/max-comment-lines": "error",
      "envden/padding-lines": "error",
      "envden/folder-size": "error",
      "envden/no-group-prefix-filenames": "error",
    },
    overrides: [
      {
        files: ["packages/adapters/**/src/**"],
        excludeFiles: ["**/__tests__/**"],
        rules: {
          "eslint/no-restricted-imports": ["error", { patterns: [CROSS_PACKAGE, ADAPTER_IMPORTS] }],
        },
      },
      {
        files: ["apps/web/**"],
        plugins: ["react", "nextjs", "jsx-a11y"],
      },
    ],
  },
});
