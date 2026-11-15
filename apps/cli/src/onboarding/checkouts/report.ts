import type { IRepoSkip } from "../../links/discovery/identify.ts";
import type { IOwnLink } from "../../links/file.ts";
import { ownLinkLine, repoSkipLine } from "../../output/render/scan/details.ts";
import { skippedSummary } from "../../output/render/scan/summary.ts";

interface IReportOptions {
  verbose?: boolean | undefined;
  command: string;
}

export function reportRepoSkips(skips: IRepoSkip[], userHome: string, options: IReportOptions) {
  if (options.verbose) {
    for (const skip of skips) console.error(repoSkipLine(skip, userHome));

    return;
  }

  const summary = skippedSummary(
    {
      remote: skips.filter((skip) => skip.kind === "remote").length,
      identity: skips.filter((skip) => skip.kind === "identity").length,
    },
    options.command,
  );

  if (summary) console.error(summary);
}

export function reportOwnLinks(links: IOwnLink[], userHome: string, options: IReportOptions) {
  if (options.verbose) {
    for (const link of links) console.error(ownLinkLine(link, userHome));

    return;
  }

  const summary = skippedSummary({ ownLinks: links.length }, options.command);
  if (summary) console.error(summary);
}
