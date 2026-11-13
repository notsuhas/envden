import type { Context } from "hono";
import type { IAppOptions, TServerEnv } from "../../http/types.ts";
import type { requestRoute } from "../../routes/policy.ts";
import { charge } from "../../auth/rate-limit.ts";
import { reserveBody } from "../body-budget.ts";
import { readBody } from "../body.ts";
import { authorizeBody } from "./body.ts";

export async function verifiedBody(
  c: Context<TServerEnv>,
  options: IAppOptions,
  route: ReturnType<typeof requestRoute>,
): Promise<() => void> {
  authorizeBody(c, options);
  const auth = c.get("auth");
  if (!auth.member && route.charge) auth.rateReceipt = charge(options, auth);
  const raw = c.req.raw;
  const authorized = route.policy === "data" || route.policy === "registration";
  const budget = auth.member ? true : authorized ? "authorized" : false;
  const release = reserveBody(raw.body ? route.limit * 2 : 0, budget);

  try {
    const body = await readBody(raw, route.limit, auth.request.bodyHash);

    if (raw.body)
      c.req.raw = new Request(raw.url, { method: raw.method, headers: raw.headers, body });

    return release;
  } catch (error) {
    release();
    throw error;
  }
}
