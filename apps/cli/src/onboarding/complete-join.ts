import { setupPreferences, type TPreferenceOptions } from "./preferences.ts";
import type { TAdapters } from "../adapters.ts";
import { loadState } from "../state/store/repository.ts";
import { requireConfigured } from "../state/configured.ts";
import { setupCheckouts } from "./scan.ts";
import { firstRun } from "../sync/first-run.ts";
import { chooseResolution } from "../output/questions.ts";

export async function completeJoin(
  adapters: TAdapters,
  now: () => number,
  effects = { setupCheckouts, firstRun, setupPreferences },
  options: TPreferenceOptions = {},
) {
  const state = requireConfigured(await loadState(adapters.home));
  await effects.setupPreferences(adapters, options);
  await effects.setupCheckouts(adapters, state, { now });

  await effects.firstRun(adapters, {
    now,
    fetcher: adapters.fetcher,
    all: true,
    interactive: true,
    choose: chooseResolution,
  });
}
