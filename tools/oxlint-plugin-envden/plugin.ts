import { definePlugin } from "vite-plus/lint/plugins";

import testsInTestsFolder from "./rules/tests-in-tests-folder.ts";
import indexReexportsOnly from "./rules/index-reexports-only.ts";
import typeNamePrefix from "./rules/type-name-prefix.ts";
import maxCommentLines from "./rules/max-comment-lines.ts";
import paddingLines from "./rules/padding-lines.ts";
import folderSize from "./rules/folder-size.ts";
import noGroupPrefixFilenames from "./rules/no-group-prefix-filenames.ts";

import qualityPolicy from "./rules/quality/policy.ts";
import trustedProcess from "./rules/trusted-process.ts";

export default definePlugin({
  meta: { name: "envden" },
  rules: {
    "quality-policy": qualityPolicy,
    "trusted-process": trustedProcess,
    "tests-in-tests-folder": testsInTestsFolder,
    "index-reexports-only": indexReexportsOnly,
    "type-name-prefix": typeNamePrefix,
    "max-comment-lines": maxCommentLines,
    "padding-lines": paddingLines,
    "folder-size": folderSize,
    "no-group-prefix-filenames": noGroupPrefixFilenames,
  },
});
