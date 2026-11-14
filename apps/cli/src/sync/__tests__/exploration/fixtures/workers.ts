import { createExplorationWorker, type TWorkerReply, type TWorkerRequest } from "./worker.ts";

export const WORKER_COUNT = 4;

interface IPending {
  resolve: (reply: TWorkerReply) => void;
  reject: (error: Error) => void;
}

function createSlot() {
  const worker = createExplorationWorker();
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
    terminate: () => worker.terminate(),
  };
}

let slots: ReturnType<typeof createSlot>[] = [];

export async function startWorkers() {
  slots = Array.from({ length: WORKER_COUNT }, createSlot);

  for (const reply of await Promise.all(slots.map((slot) => slot.ready)))
    if (reply.kind !== "ready") throw new Error("Exploration worker failed to start");
}

export async function runWorker(
  index: number,
  layout: readonly ("copy" | "link")[],
  tokens: string[],
) {
  const reply = await slots[index]!.request({ kind: "run", layout, tokens });

  if (reply.kind === "error") throw new Error(reply.message);
  if (reply.kind !== "result") throw new Error("Unexpected exploration worker reply");

  return reply.result;
}

export async function stopWorkers() {
  try {
    for (const reply of await Promise.all(slots.map((slot) => slot.request({ kind: "close" }))))
      if (reply.kind !== "closed") throw new Error("Exploration worker failed to close");
  } finally {
    await Promise.all(slots.map((slot) => slot.terminate()));
    slots = [];
  }
}
