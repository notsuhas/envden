import { spinner } from "@clack/prompts";
import { sanitizeTerminal } from "../sanitize.ts";

interface IScanProgress {
  found: (count: number) => void;
  done: (count: number) => void;
  abort: () => void;
}

const silent: IScanProgress = { found: () => {}, done: () => {}, abort: () => {} };

export function scanProgress(where: string, enabled = !!process.stdout.isTTY): IScanProgress {
  if (!enabled) return silent;

  const indicator = spinner();
  const label = `Looking for repos in ${sanitizeTerminal(where)} …`;
  indicator.start(`${label} 0 found`);

  return {
    found: (count) => indicator.message(`${label} ${count} found`),
    done: (count) =>
      indicator.stop(`Found ${count} ${count === 1 ? "repo" : "repos"} with env files`),
    abort: () => indicator.clear(),
  };
}
