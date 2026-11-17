import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { probeIsolation } from "./isolation/probe.ts";
import { transportCases, type ICase } from "./transport/cases.ts";
import { observationsEqual } from "./transport/semantic.ts";
import { observe, reachedStatus, headLengths } from "./transport/compare.ts";
import { createRequests } from "./transport/request.ts";
import { startPair } from "./transport/servers.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args[args.indexOf(name) + 1];
const [reference, candidate] = [flag("--reference"), flag("--candidate")];

const mode = args.includes("--mode") ? flag("--mode") : "semantic";

if (
  !reference ||
  !candidate ||
  !["semantic", "raw"].includes(mode!) ||
  args.length !== (args.includes("--mode") ? 6 : 4)
)
  throw new Error(
    "Usage: bun parity/transport.ts --reference <envden> --candidate <envden> [--mode semantic|raw]",
  );

const root = await mkdtemp(join(tmpdir(), "envden-transport-"));

const pair = await startPair(
  [resolve(reference), resolve(candidate)],
  root,
  await probeIsolation(),
);

let failed = 0;

async function check(item: ICase): Promise<string> {
  const [expected, actual] = await Promise.all(pair.ports.map((port) => observe(port, item)));

  const getLengths = mode === "semantic" ? await headLengths(item, pair.ports) : [];

  const matches =
    reachedStatus(item, expected!) &&
    observationsEqual(item, [expected!, actual!], mode === "raw", getLengths);

  failed += Number(!matches);

  return matches
    ? `PASS ${item.name}`
    : `FAIL ${item.name}\nreference: ${JSON.stringify(expected)}\ncandidate: ${JSON.stringify(actual)}`;
}

try {
  const cases = transportCases(createRequests(pair.credentials));

  for (const item of cases.filter((c) => !c.stalled)) console.log(await check(item));
  for (const line of await Promise.all(cases.filter((c) => c.stalled).map(check)))
    console.log(line);

  console.log(`${cases.length - failed}/${cases.length} ${mode} transport cases passed`);
} finally {
  await pair.stop();
  await rm(root, { recursive: true, force: true });
}

process.exitCode = failed ? 1 : 0;
