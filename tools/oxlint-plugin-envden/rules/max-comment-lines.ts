import { checkCommentProgram } from "../lib/visitors/max-comment-lines.ts";
import { defineRule } from "vite-plus/lint/plugins";

export default defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "AGENTS.md: comments are one line at most; no JSDoc essays." },
  },
  create(context) {
    return {
      Program(node) {
        checkCommentProgram(context, node);
      },
    };
  },
});
