import { parentPort } from "node:worker_threads";
import { createSqliteStorageAdapter } from "../index.ts";

parentPort?.on("message", (data: { dir: string; index: number; barrier: SharedArrayBuffer }) => {
  const storage = createSqliteStorageAdapter(data.dir, 0);
  parentPort?.postMessage("ready");
  const gate = new Int32Array(data.barrier);
  Atomics.wait(gate, 0, 0);

  try {
    parentPort?.postMessage(
      storage.commitSwap(
        new Uint8Array([1]),
        undefined,
        {
          header: { seq: 1n, hash: new Uint8Array([data.index + 1]), bytes: new Uint8Array([4]) },
          entries: [],
          bodyDigest: new Uint8Array([data.index + 10]),
          vault: { active: true, frozen: false, proofRefused: false },
        },
        0,
      ),
    );
  } finally {
    storage.close();
  }
});
