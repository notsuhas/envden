import { basename, join } from "node:path";
import { keyList } from "../output/key-list.ts";
import type { ITemplateCheck } from "./checks.ts";

export function templateNoticeLines(checks: ITemplateCheck[]) {
  return checks
    .filter((check) => check.missing.length)
    .map(
      (check) =>
        `envden: ${join(basename(check.root), check.path)} missing ${keyList(check.missing)} (from ${check.template})`,
    );
}
