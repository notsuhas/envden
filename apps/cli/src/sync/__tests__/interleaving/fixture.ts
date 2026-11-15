import { join } from "node:path";
import type { syncFixture } from "../flows.ts";
import { approveLayout } from "../round-fixture.ts";
import { Reference } from "./model.ts";
import { syncContext } from "../../remote/context.ts";
import { acceptHead } from "../../remote/accept.ts";
import { entryContent, entryName } from "../../remote/content.ts";
import { conflictRecords } from "../../local/conflicts.ts";

export const read = async (path: string) =>
  Bun.file(path)
    .exists()
    .then((exists) => (exists ? Bun.file(path).text() : undefined));

export async function interleavingFixture(f: Awaited<ReturnType<typeof syncFixture>>) {
  const targets = await approveLayout(f, ["copy", "copy", "link"]);
  const reports: string[] = [];
  const saved: string[] = [];

  return {
    f,
    devices: [f.first, f.second],
    roots: [f.checkout.root, targets[0]!.root],
    stores: [f.aStore, targets[0]!.store],
    paths: [join(f.checkout.root, ".env"), ...targets.map((item) => join(item.root, ".env"))],
    reports,
    saved,
    opts: { ...f.opts, report: (message: string) => reports.push(message) },
    model: new Reference("TOKEN=local-test-value\n"),
  };
}

export type TRun = Awaited<ReturnType<typeof interleavingFixture>>;

export async function serverBytes(f: TRun["f"]) {
  const context = await syncContext(f.third, f.opts);
  await acceptHead(context);

  const entry = context.checkpoint.files.entries.find((item) => {
    const name = entryName(context, item);

    return name.repoId === f.checkout.repoId && name.path === ".env";
  });

  const bytes = entry ? await entryContent(context, entry) : undefined;

  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}

export async function verifySurvival(run: TRun) {
  for (const report of run.reports) {
    const match = /^Saved .*: (.+)$/.exec(report) ?? /^Kept your previous .* at (.+)$/.exec(report);
    if (match) run.saved.push(match[1]!);
  }

  for (const device of run.devices)
    for (const record of await conflictRecords(device.home)) run.saved.push(...record.alternatives);

  run.model.survive(await Promise.all([...run.stores, ...run.paths, ...run.saved].map(read)));
}
