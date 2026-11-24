import { spinner } from "@clack/prompts";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import type { ISendProgress } from "./run.ts";

const FINISHED = {
  claimed: "Claimed, link closed",
  expired: "Expired, link closed",
  stopped: "Stopped, link closed",
};

function linkText(link: string, minutes: number, checked: boolean): string {
  return [
    `Send this link to the recipient. It opens once, within ${minutes} minutes:`,
    "",
    `  ${sanitizeTerminal(link)}`,
    "",
    "They can open it in any browser, or run envden receive '<link>'.",
    ...(checked
      ? []
      : ["Public DNS couldn't be checked from here; the link may take a few minutes to work."]),
  ].join("\n");
}

export function sendProgress(interactive = !!process.stdout.isTTY): ISendProgress {
  if (!interactive)
    return {
      opening: () => {},
      ready: (link, minutes, checked) => console.log(linkText(link, minutes, checked)),
      finished: (outcome) => console.log(FINISHED[outcome]),
      failed: () => {},
    };

  let indicator = spinner({ cancelMessage: FINISHED.stopped });

  return {
    opening: () => indicator.start("Opening a temporary public link"),
    ready: (link, minutes, checked) => {
      indicator.stop("Public link ready");
      console.log(linkText(link, minutes, checked));
      indicator = spinner({ cancelMessage: FINISHED.stopped });
      indicator.start("Waiting for the recipient. Ctrl-C closes the link");
    },
    finished: (outcome) => indicator.stop(FINISHED[outcome]),
    failed: () => indicator.clear(),
  };
}
