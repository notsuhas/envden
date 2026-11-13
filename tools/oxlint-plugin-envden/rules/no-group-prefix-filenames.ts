import { checkFilenameProgram } from "../lib/visitors/no-group-prefix-filenames.ts";
import { defineRule } from "vite-plus/lint/plugins";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "AGENTS.md: do not encode the group in a filename; make it a folder." },
  },
  create(context) {
    return {
      Program(node) {
        checkFilenameProgram(context, node);
      },
    };
  },
});
