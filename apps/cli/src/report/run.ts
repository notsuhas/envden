import type { TAdapters } from "../adapters.ts";
import { choose } from "../output/prompts/questions.ts";
import { homePath } from "../output/home-path.ts";
import { openBrowser } from "../ui/browser.ts";
import { PromptCancelled } from "../state/cancelled.ts";
import { reportDocument } from "./content/document.ts";
import { issueTitle, issueUrl, NEW_ISSUE_URL } from "./content/issue.ts";
import { agentPrompt } from "./content/prompt.ts";
import { reportFacts } from "./facts.ts";
import { detectHarnesses, launchCommand } from "./harness.ts";
import { launchHarness } from "./launch.ts";
import { deriveReportOffer } from "./offer.ts";
import { writeReport } from "./write.ts";

interface IReportEffects {
  env: Record<string, string | undefined>;
  interactive: boolean;
  argv: string[];
  which: (command: string) => string | null;
  choose: typeof choose;
  launch: (command: string[]) => Promise<void>;
  open: (url: string) => Promise<boolean>;
  print: (line: string) => void;
}

function systemEffects(): IReportEffects {
  return {
    env: process.env,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    argv: process.argv.slice(2),
    which: (command) => Bun.which(command),
    choose,
    launch: launchHarness,
    open: openBrowser,
    print: (line) => console.error(line),
  };
}

// Never throws: a failed report must not hide or change the original error.
export async function reportProblem(
  error: unknown,
  adapters: Pick<TAdapters, "home" | "userHome" | "now">,
  effects: IReportEffects = systemEffects(),
): Promise<void> {
  try {
    if (!deriveReportOffer({ error, interactive: effects.interactive, env: effects.env })) return;

    const harnesses = detectHarnesses(effects.which);

    const choice = await effects.choose(
      "This looks like an envden bug. Report it?",
      [
        ...harnesses.map((harness) => ({
          value: harness.id,
          label: `Ask ${harness.name} to look into it and draft a GitHub issue`,
        })),
        { value: "browser", label: "Open a pre-filled GitHub issue in the browser" },
        { value: "no", label: "No" },
      ],
      "no",
    );

    if (choice === "no") return;

    const facts = await reportFacts(adapters.home, adapters.userHome, error, effects.argv);
    const document = reportDocument(facts);
    const path = await writeReport(adapters.home, document, adapters.now);
    effects.print(`Report saved to ${homePath(path, adapters.userHome)}`);

    const harness = harnesses.find((entry) => entry.id === choice);
    const logs = facts.files.filter((file) => file.exists).map((file) => file.path);

    if (harness) return await effects.launch(launchCommand(harness, agentPrompt(path, logs)));

    if (!(await effects.open(issueUrl(issueTitle(facts.args, facts.failure.code), document))))
      effects.print(`Couldn't open a browser. Open ${NEW_ISSUE_URL} and paste the report.`);
  } catch (failure) {
    if (!(failure instanceof PromptCancelled)) effects.print("Couldn't prepare the report.");
  }
}
