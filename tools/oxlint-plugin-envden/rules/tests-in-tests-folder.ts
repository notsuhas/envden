import { basename, dirname } from "node:path";
import { defineRule } from "vite-plus/lint/plugins";

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "AGENTS.md: tests live in a __tests__/ folder next to the code they test.",
    },
  },
  create(context) {
    return {
      Program(node) {
        if (
          /\.test\.tsx?$/u.test(context.filename) &&
          basename(dirname(context.filename)) !== "__tests__"
        ) {
          context.report({ node, message: "Move this test into a direct parent named __tests__." });
        }
      },
    };
  },
});
