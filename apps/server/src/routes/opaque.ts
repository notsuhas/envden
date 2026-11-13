import type { Hono } from "hono";
import {
  LoginStartSchema,
  LoginFinishSchema,
  RegistrationStartSchema,
  RegistrationFinishSchema,
} from "@envden/core/protocol";
import type { IAppOptions, TServerEnv } from "../http/types.ts";
import { input } from "../http/encoding.ts";
import { startLogin, finishLogin } from "../auth/login.ts";
import { startRegistration, finishRegistration } from "../auth/registration.ts";

export function registerOpaque(app: Hono<TServerEnv>, options: IAppOptions) {
  return app
    .post("/v1/opaque/login/start", async (c) => {
      const raw: unknown = await c.req.json();
      const body = input(() => LoginStartSchema.parse(raw));

      return c.json(await startLogin(options, c.get("auth"), body.purpose, body.message));
    })
    .post("/v1/opaque/login/finish", async (c) => {
      const raw: unknown = await c.req.json();
      const body = input(() => LoginFinishSchema.parse(raw));

      return c.json(await finishLogin(options, c.get("auth"), body.purpose, body.message));
    })
    .post("/v1/opaque/registration/start", async (c) => {
      const raw: unknown = await c.req.json();
      const body = input(() => RegistrationStartSchema.parse(raw));

      return c.json(await startRegistration(options, c.get("auth"), body.message));
    })
    .post("/v1/opaque/registration/finish", async (c) => {
      const raw: unknown = await c.req.json();
      const body = input(() => RegistrationFinishSchema.parse(raw));

      return c.json(finishRegistration(options, c.get("auth"), body.message));
    });
}
