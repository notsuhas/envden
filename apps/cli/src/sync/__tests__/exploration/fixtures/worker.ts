import { Worker, parentPort, type MessagePort } from "node:worker_threads";
import { run } from "../run.ts";
import { fresh, shutdown } from "./world.ts";

export type TWorkerRequest =
  | { kind: "run"; layout: readonly ("copy" | "link")[]; tokens: string[] }
  | { kind: "close" };

export type TWorkerReply =
  | { kind: "ready" | "closed" }
  | { kind: "result"; result: Awaited<ReturnType<typeof run>> }
  | { kind: "error"; message: string };

export function createExplorationWorker() {
  return new Worker(new URL(import.meta.url));
}

async function serve(port: MessagePort) {
  await fresh(["copy", "link"]);
  port.postMessage({ kind: "ready" } satisfies TWorkerReply);

  port.on("message", async (request: TWorkerRequest) => {
    try {
      if (request.kind === "close") {
        await shutdown();
        port.postMessage({ kind: "closed" } satisfies TWorkerReply);
        port.close();
      } else {
        const result = await run(request.layout, request.tokens);
        port.postMessage({ kind: "result", result } satisfies TWorkerReply);
      }
    } catch (error) {
      port.postMessage({
        kind: "error",
        message: error instanceof Error ? error.message : "Worker trace failed",
      } satisfies TWorkerReply);
    }
  });
}

if (parentPort) void serve(parentPort);
