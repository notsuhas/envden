import type { Hono } from "hono";
import { JoinOpenSchema, JoinSlotSchema, JoinWriteSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { binary, input } from "../http/encoding.ts";
import { requireMember } from "../middleware/member.ts";
import {
  openJoinRequest,
  listJoinRequests,
  readJoinSlot,
  writeJoinSlot,
  closeJoinRequest,
  fetchApproved,
} from "../join/requests.ts";

function requestNumber(value: string): number {
  if (!/^[1-9][0-9]{0,2}$/.test(value))
    throw new EnvdenError("INVALID_INPUT", "Invalid join request number");

  return Number(value);
}

export function registerJoin(app: Hono<TServerEnv>, options: IAppOptions) {
  return app
    .post("/v1/join-requests", async (c) => {
      const auth = c.get("auth");
      if (auth.member) throw new EnvdenError("CONFLICT", "Already a member");
      const raw: unknown = await c.req.json();
      const body = input(() => JoinOpenSchema.parse(raw));
      const record = binary(c.req.header("Envden-Device-Record"));

      return c.json(openJoinRequest(options, auth, record, binary(body.commit, 32)));
    })
    .get("/v1/join-requests", (c) => {
      requireMember(c.get("auth"));

      return c.json(listJoinRequests(options));
    })
    .get("/v1/join-requests/approved", (c) => c.json(fetchApproved(options, c.get("auth"))))
    .get("/v1/join-requests/:number/:slot", (c) => {
      const number = requestNumber(c.req.param("number"));
      const slot = input(() => JoinSlotSchema.parse(c.req.param("slot")));

      return c.json(readJoinSlot(options, c.get("auth"), number, slot));
    })
    .put("/v1/join-requests/:number/:slot", async (c) => {
      const number = requestNumber(c.req.param("number"));
      const slot = input(() => JoinSlotSchema.parse(c.req.param("slot")));
      const raw: unknown = await c.req.json();
      const body = input(() => JoinWriteSchema.parse(raw));

      return c.json(writeJoinSlot(options, c.get("auth"), number, slot, body.message));
    })
    .delete("/v1/join-requests/:number", (c) =>
      c.json(closeJoinRequest(options, c.get("auth"), requestNumber(c.req.param("number")))),
    );
}
