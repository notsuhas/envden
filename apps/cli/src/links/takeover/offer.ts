import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { consent } from "../../output/prompts/questions.ts";
import { realHome } from "../../output/home-path.ts";
import type { IOwnLink } from "../file.ts";
import { adoptGroup } from "./adopt.ts";
import { groupOwnLinks, takeoverQuestion } from "./group.ts";
import { regularTarget } from "./target.ts";

// asks once per link target; returns the links left in place
export async function offerTakeover(
  adapters: TAdapters,
  state: ILocalState,
  links: IOwnLink[],
  copy = false,
  ask: (question: string) => Promise<boolean> = askInTerminal,
): Promise<IOwnLink[]> {
  const home = await realHome(adapters.userHome);
  const left: IOwnLink[] = [];

  for (const group of groupOwnLinks(links))
    if ((await regularTarget(group.target)) && (await ask(takeoverQuestion(group, home))))
      left.push(...(await adoptGroup(adapters, state, group, copy)));
    else left.push(...group.links);

  return left;
}

async function askInTerminal(question: string) {
  return !!process.stdin.isTTY && consent(question, true);
}
