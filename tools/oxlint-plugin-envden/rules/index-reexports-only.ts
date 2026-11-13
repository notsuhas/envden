import { checkIndexProgram } from "../lib/visitors/index-reexports-only.ts";
import { defineRule } from "vite-plus/lint/plugins";

export default defineRule({
  meta: {
    type: "problem",
    docs: { description: "AGENTS.md: index.ts files only re-export; they contain no logic." },
  },
  create(context) {
    return {
      Program(node) {
        checkIndexProgram(context, node);
      },
    };
  },
});
