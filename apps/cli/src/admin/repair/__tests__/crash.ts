import * as p from "@envden/core/protocol";
import { loadState } from "../../../state/store/repository.ts";
import type { TFetch } from "../../../client/fetch.ts";
import { expect } from "bun:test";
import { finishRepair } from "../finish.ts";

type TCrash = "none" | "before-close" | "after-close" | "adoption";

export async function checkCrash(
  adapters: Parameters<typeof finishRepair>[0],
  options: Parameters<typeof finishRepair>[1],
  crash: TCrash,
) {
  let failed = false;
  let closed = false;

  if (crash !== "none") {
    const fetcher: TFetch = async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;

      if (!failed && crash === "before-close" && path === "/v1/repair/finish") {
        failed = true;
        throw new Error("Crash before close");
      }

      const response = await options.fetcher(input, init);
      if (path === "/v1/repair/finish") closed = true;

      if (!failed && shouldCrashAfter(crash, path, closed)) {
        failed = true;
        throw new Error("Crash after close");
      }

      return response;
    };

    try {
      await finishRepair(adapters, { ...options, fetcher });
      throw new Error("Expected injected crash");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    expect(failed).toBe(true);
  }
}

function shouldCrashAfter(crash: TCrash, path: string, closed: boolean) {
  if (crash === "after-close") return path === "/v1/repair/finish";

  return crash === "adoption" && closed && path === "/v1/head";
}

export async function checkRestorePoint(
  adapters: Parameters<typeof finishRepair>[0],
  options: Parameters<typeof finishRepair>[1],
  mode: string,
  crash: string,
) {
  if (mode !== "password" || crash !== "after-close") return;
  const local = (await loadState(adapters.home))!;

  await Promise.resolve(
    expect(
      finishRepair(adapters, {
        ...options,
        fetcher: async (input, init) => {
          const response = await options.fetcher(input, init);

          if (
            new URL(input instanceof Request ? input.url : input.toString()).pathname !==
            "/v1/repair/status"
          )
            return response;

          const status = p.RepairStatusSchema.parse(await response.json());

          return Response.json({ ...status, restoredHead: local.checkpoint });
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_DATA" }),
  );
}
