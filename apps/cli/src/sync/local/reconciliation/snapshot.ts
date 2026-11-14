import { join } from "node:path";
import type { TSyncContext } from "../../remote/context.ts";
import { basePath, readBytes, same } from "../files.ts";

type TTarget = TSyncContext["state"]["links"][number];

export async function fileSnapshot(
  context: TSyncContext,
  target: TTarget,
  stored: Uint8Array | undefined,
  applied: Uint8Array | undefined,
) {
  const destination = join(target.root, target.path);

  const status = await context.adapters
    .placement(target.mode, target.root)
    .inspect(target.store, destination);

  const tracked = context.state.links.some(
    (item) => item.root === target.root && item.path === target.path,
  );

  const base = basePath(
    context.adapters.home,
    target.store,
    target.mode === "copy" ? target.root : undefined,
  );

  const useStore = target.mode === "link" && status !== "detached";
  const bytes = useStore ? stored : await readBytes(destination);

  const previous =
    target.mode === "link" && applied !== undefined ? applied : await readBytes(base);

  const detached =
    target.mode === "link" &&
    status === "detached" &&
    !same(bytes, stored) &&
    (!tracked || !same(stored, previous));

  return {
    target,
    tracked,
    useStore,
    bytes,
    base: previous,
    detached,
    mode: target.mode,
    historical: (!tracked || previous === undefined) && bytes !== undefined && same(bytes, applied),
  };
}
