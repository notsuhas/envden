import { join, relative, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { placeInRoot } from "@envden/core/paths";
import type { ILocalState } from "../../state/model.ts";

interface IFileChoice {
  file?: string;
  cwd: string;
  interactive: boolean;
}

type TChoose = (message: string, options: { value: string; label: string }[]) => Promise<string>;

// The synced env files of the checkout the command runs in.
export function sendCandidates(state: ILocalState | undefined, cwd: string): string[] {
  const checkout = (state?.approved ?? [])
    .filter((item) => placeInRoot(item.root, cwd) !== "outside")
    .sort((a, b) => b.root.length - a.root.length)[0];

  if (!state || !checkout) return [];

  return state.links
    .filter((link) => link.root === checkout.root && !link.localOnly)
    .map((link) => join(link.root, link.path))
    .sort();
}

export async function chooseSendFile(
  state: ILocalState | undefined,
  options: IFileChoice,
  choose: TChoose,
): Promise<string> {
  if (options.file !== undefined) return resolve(options.cwd, options.file);

  if (!options.interactive)
    throw new EnvdenError("INVALID_INPUT", "Name the file to send when not in a terminal");

  const candidates = sendCandidates(state, options.cwd);

  if (candidates.length === 0)
    throw new EnvdenError("INVALID_INPUT", "No synced env file here. Name the file to send");

  if (candidates.length === 1) return candidates[0]!;

  return choose(
    "Which file?",
    candidates.map((path) => ({ value: path, label: relative(options.cwd, path) || path })),
  );
}
