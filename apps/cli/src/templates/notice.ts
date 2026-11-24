import { basename, join } from "node:path";
import type { ITemplateCheck } from "./checks.ts";

const SHOWN = 3;

export function templateNoticeLines(checks: ITemplateCheck[]) {
  return checks
    .filter((check) => check.missing.length)
    .map(
      (check) =>
        `envden: ${join(basename(check.root), check.path)} missing ${keyList(check.missing)} (from ${check.template})`,
    );
}

function keyList(keys: string[]) {
  const shown = keys.slice(0, SHOWN).join(", ");

  return keys.length > SHOWN ? `${shown} and ${keys.length - SHOWN} more` : shown;
}
