import type { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExplorationWorker, type TWorkerReply, type TWorkerRequest } from "./worker.ts";

export const WORKER_COUNT = 4;

interface IPending {
  resolve: (reply: TWorkerReply) => void;
  reject: (error: Error) => void;
}

type TWorkerFactory = (
  directory: string,
) => Pick<ReturnType<typeof createExplorationWorker>, "postMessage" | "terminate"> &
  Pick<EventEmitter, "on">;

let createWorker: TWorkerFactory = createExplorationWorker;

function createSlot() {
  const directory = mkdtempSync(join(tmpdir(), "envden-sync-worker-"));
  const worker = createWorker(directory);
  let pending: IPending | undefined;
  let failure: Error | undefined;

  worker.on("message", (reply: TWorkerReply) => {
    pending?.resolve(reply);
    pending = undefined;
  });

  worker.on("error", (error: unknown) => {
    failure = error instanceof Error ? error : new Error("Exploration worker failed");
    pending?.reject(failure);
    pending = undefined;
  });

  worker.on("exit", () => {
    if (!pending) return;
    failure = new Error("Exploration worker exited before replying");
    pending.reject(failure);
    pending = undefined;
  });

  function waitForReply() {
    if (failure) return Promise.reject(failure);

    return new Promise<TWorkerReply>((resolve, reject) => {
      pending = { resolve, reject };
    });
  }

  const ready = waitForReply();

  return {
    ready,
    request(message: TWorkerRequest) {
      if (pending) throw new Error("Exploration worker is busy");
      const reply = waitForReply();
      worker.postMessage(message);

      return reply;
    },
    async terminate() {
      try {
        await worker.terminate();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}

let slots: ReturnType<typeof createSlot>[] = [];

export async function startWorkers(factory: TWorkerFactory = createExplorationWorker) {
  createWorker = factory;
  slots = Array.from({ length: WORKER_COUNT }, createSlot);

  try {
    for (const reply of await Promise.all(slots.map((slot) => slot.ready)))
      if (reply.kind !== "ready") throw new Error("Exploration worker failed to start");
  } catch (error) {
    await Promise.allSettled(slots.map((slot) => slot.terminate()));
    slots = [];
    throw error;
  }
}

export async function runWorker(
  index: number,
  layout: readonly ("copy" | "link")[],
  tokens: string[],
  signal?: AbortSignal,
) {
  const slot = slots[index]!;
  let reply: TWorkerReply;

  try {
    reply = await withSignal(slot.request({ kind: "run", layout, tokens }), signal);
  } catch (error) {
    await slot.terminate();
    const replacement = createSlot();
    slots[index] = replacement;

    if ((await replacement.ready).kind !== "ready")
      throw new Error("Exploration replacement worker failed to start");

    throw error;
  }

  if (reply.kind === "error") throw new Error(reply.message);
  if (reply.kind !== "result") throw new Error("Unexpected exploration worker reply");

  return reply.result;
}

export async function stopWorkers() {
  try {
    const replies = await Promise.allSettled(
      slots.map(async (slot) => {
        const reply = await slot.request({ kind: "close" });

        if (reply.kind !== "closed") throw new Error("Exploration worker failed to close");
      }),
    );

    const failed = replies.find((reply) => reply.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  } finally {
    await Promise.allSettled(slots.map((slot) => slot.terminate()));
    slots = [];
  }
}

async function withSignal<T>(reply: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return reply;
  let abort: () => void = () => {};

  const deadline = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error("Exploration worker request aborted"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });

  try {
    return await Promise.race([reply, deadline]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
