import type { createApi } from "./api.ts";
import { busy, errorText, notify } from "./notice.ts";

type TCall = ReturnType<typeof createApi>;

export function createRename(call: TCall, refresh: () => Promise<boolean>) {
  return async function rename(name: string): Promise<string | undefined> {
    let failure: string | undefined;

    await busy("Renaming this device...", async () => {
      try {
        const result = await call<{ kind: "renamed" | "unchanged" }>("devices/rename", { name });
        await refresh();

        notify(
          result.kind === "renamed"
            ? `This device is now ${name}.`
            : "This device already has that name.",
        );
      } catch (error) {
        failure = errorText(error);
        notify("Rename failed; see Devices.", true);
      }
    });

    return failure;
  };
}
