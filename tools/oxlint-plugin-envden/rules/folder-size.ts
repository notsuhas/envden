import { basename, dirname } from "node:path";
import { defineRule } from "vite-plus/lint/plugins";

import { sourceSiblings } from "../lib/siblings.ts";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "AGENTS.md: once a folder passes about 8 files, split it into subfolders.",
    },
  },
  create(context) {
    return {
      Program(node) {
        if (basename(dirname(context.filename)) === "__tests__") return;

        const siblings = sourceSiblings(context.filename);

        if (siblings.length > 8 && basename(context.filename) === siblings[0]) {
          context.report({
            node,
            message: `Folder ${basename(dirname(context.filename))} has ${siblings.length} source files; split it into domain folders (maximum 8).`,
          });
        }
      },
    };
  },
});
