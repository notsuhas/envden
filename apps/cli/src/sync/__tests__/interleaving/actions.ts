import { expect } from "bun:test";
import { join } from "node:path";
import { pull, push } from "../../engine.ts";
import { removeFile } from "../../remove.ts";
import { resolveConflict } from "../../resolve.ts";
import { atomicWrite } from "../../../state/store/files.ts";
import { loadState, saveState } from "../../../state/store/repository.ts";
import { untrack } from "../../../links/checkout/untrack.ts";
import { linkFile } from "../../../links/file.ts";
import { read, serverBytes, type TRun } from "./fixture.ts";

const fixtureClock = () => 1800000000000;

export async function edit(run: TRun, device: number, bytes: string) {
  const path = join(run.roots[device]!, ".env");
  run.model.user(device, await read(path), bytes);
  await atomicWrite(device === 0 ? run.stores[device]! : path, bytes, fixtureClock);
}

export async function receive(run: TRun, device: number, fail = false) {
  const adapters = run.devices[device]!;
  const original = adapters.repo.ensureIgnored.bind(adapters.repo);

  if (fail)
    adapters.repo.ensureIgnored = async () => {
      throw new Error("Placement failure");
    };

  const result = await pull(adapters, run.opts);
  adapters.repo.ensureIgnored = original;
  if (result.conflicts) return;
  run.model.observe(device, await read(join(run.roots[device]!, ".env")));
  expect((await pull(adapters, run.opts)).changed).toBe(0);
}

export async function send(run: TRun, device: number, lost = false) {
  const fetcher: typeof run.f.fetcher = async (input, init) => {
    const result = await run.f.fetcher(input, init);

    if (new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/swap")
      throw new Error("Lost response");

    return result;
  };

  try {
    await push(run.devices[device]!, lost ? { ...run.opts, fetcher } : run.opts);
  } catch (error) {
    if (
      !lost ||
      !(error instanceof Error) ||
      !(error.cause instanceof Error) ||
      error.cause.message !== "Lost response"
    )
      throw error;
  }

  run.model.commit(device, await serverBytes(run.f));
}

export async function remove(run: TRun, device: number) {
  const path = join(run.roots[device]!, ".env");
  run.model.user(device, await read(path), undefined);

  try {
    const result = await removeFile(run.devices[device]!, path, { yes: true, now: run.f.now });
    run.saved.push(...result.preserved);
  } catch (error) {
    expectedFailure(error, "NOT_FOUND");
  }
}

export async function resolve(run: TRun, device: number, choice: "keep-mine" | "take-server") {
  try {
    const result = await resolveConflict(run.devices[device]!, {
      file: ".env",
      choice,
      now: run.f.now,
    });

    run.saved.push(...result.preserved);
    run.model.observe(device, await read(join(run.roots[device]!, ".env")));
  } catch (error) {
    expectedFailure(error, "INVALID_INPUT");
  }
}

export async function retrack(run: TRun, device: number) {
  const adapters = run.devices[device]!;
  const root = run.roots[device]!;
  const path = join(root, ".env");
  const state = (await loadState(adapters.home))!;
  const checkout = state.approved.find((item) => item.root === root)!;
  await untrack(adapters, root);
  const next = (await loadState(adapters.home))!;
  next.approved.push(checkout);

  if ((await read(path)) !== undefined)
    await linkFile(adapters, next, checkout, adapters.placement("copy", root), ".env");

  await saveState(adapters.home, next, fixtureClock);
}

function expectedFailure(error: unknown, code: string) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== code) throw error;
}
