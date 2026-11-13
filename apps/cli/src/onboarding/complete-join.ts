import type { TAdapters } from "../adapters.ts";
import { loadState } from "../state/repository.ts";
import { requireConfigured } from "../state/configured.ts";
import { setupCheckouts } from "./scan.ts";
import { firstRun } from "../sync/first-run.ts";
import { input } from "../output/questions.ts";
import { EnvdenError } from "@envden/core/errors";

export async function completeJoin(adapters: TAdapters, now: () => number) {
  const state = requireConfigured(await loadState(adapters.home), "Join did not configure a vault");
  await setupCheckouts(adapters, state, {});

  await firstRun(adapters, {
    now,
    fetcher: fetch,
    all: true,
    interactive: true,
    choose: chooseFirstRun,
  });
}

async function chooseFirstRun(path: string) {
  const choice = await input(`${path}: keep-mine, take-server or merge?`);
  if (choice === "keep-mine" || choice === "take-server" || choice === "merge") return choice;

  throw new EnvdenError("INVALID_INPUT", "Unknown first-run choice");
}
