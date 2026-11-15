import { spyOn } from "bun:test";
import * as files from "../../../../state/store/files.ts";

const fixtureClock = () => 1800000000000;

export function placementFault(enabled: boolean) {
  let killed = false;
  let writes = 0;
  const original = files.atomicWrite;

  const fault = enabled
    ? spyOn(files, "atomicWrite").mockImplementation(async (path, bytes) => {
        if (path.endsWith(".pending") && ++writes === 2) {
          killed = true;
          throw new Error("Killed before written mark");
        }

        await original(path, bytes, fixtureClock);
      })
    : undefined;

  return { killed: () => killed, restore: () => fault?.mockRestore() };
}
