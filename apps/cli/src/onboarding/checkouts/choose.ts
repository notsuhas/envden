import type { ICheckout } from "@envden/core/adapters";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { chooseMany } from "../../output/prompts/questions.ts";
import { realHome } from "../../output/home-path.ts";
import { checkoutLabel } from "../../links/approval.ts";
import { autoApprovedWorktree } from "../../links/checkout/worktree.ts";
import type { IEligible } from "./eligible.ts";

export async function chosenCheckouts(
  adapters: TAdapters,
  state: ILocalState,
  eligible: IEligible[],
) {
  const automatic: ICheckout[] = [];
  const asked: IEligible[] = [];

  // checkouts approved on an earlier run relink without asking again
  for (const item of eligible)
    if (
      state.approved.some((approved) => approved.root === item.checkout.root) ||
      (await autoApprovedWorktree(adapters, state, item.checkout))
    )
      automatic.push(item.checkout);
    else asked.push(item);

  return [...automatic, ...(await chooseCheckouts(adapters, state, asked))];
}

async function chooseCheckouts(adapters: TAdapters, state: ILocalState, asked: IEligible[]) {
  if (!asked.length) return [];

  if (!process.stdin.isTTY)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Approve checkouts in your own terminal with envden track",
    );

  const home = await realHome(adapters.userHome);

  const roots = await chooseMany(
    "Sync env files for these checkouts?",
    asked.map((item) => ({
      value: item.checkout.root,
      label: checkoutLabel(state, item.checkout, item.files, home),
    })),
  );

  if (!roots.length) console.log("No checkouts selected. Add one later with: envden track <path>");

  return asked.map((item) => item.checkout).filter((checkout) => roots.includes(checkout.root));
}
