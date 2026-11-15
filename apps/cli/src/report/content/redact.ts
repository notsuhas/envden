import { isToken } from "@envden/core/protocol";

const SECRET_KEY = /EK1(?:-[0-9A-Z]{1,5})+/gi;

const BASE32_RUN = /\b[0-9A-HJKMNP-TV-Z]{40,}\b/gi;

const ENV_LINE = /^(\s*(?:export\s+)?[A-Za-z_][\w.-]*\s*=).*$/gm;

const ASSIGNMENT = /\b([A-Za-z_][\w.-]*)=("[^"]*"|'[^']*'|[^\s&"']+)/g;

function maskRun(run: string): string {
  if (isToken("setup", run)) return "[setup token]";

  return isToken("repair", run) ? "[repair token]" : "[redacted]";
}

export function redactSecrets(text: string): string {
  return text
    .replace(SECRET_KEY, "EK1-[redacted]")
    .replace(BASE32_RUN, maskRun)
    .replace(ENV_LINE, "$1[redacted]")
    .replace(ASSIGNMENT, "$1=[redacted]");
}
