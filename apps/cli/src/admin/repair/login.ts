import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../../client/request.ts";

export async function repairLogin(
  client: TClient,
  vaultId: Uint8Array,
  password: string,
  kind: "login" | "register",
) {
  const identifiers = p.unlockIdentifiers(vaultId).identifiers;

  if (kind === "register") {
    const start = await p.opaqueStartRegistration(password);

    const body = p.MessageResponseSchema.parse(
      await (
        await client.request("/v1/opaque/registration/start", "POST", {
          message: start.registrationRequest,
        })
      ).json(),
    );

    const finish = await p.opaqueFinishRegistration({
      password,
      registrationResponse: body.message,
      clientRegistrationState: start.clientRegistrationState,
      identifiers,
    });

    return { kind: "registration" as const, message: finish.registrationRecord };
  }

  const start = await p.opaqueStartLogin(password);

  const body = p.MessageResponseSchema.parse(
    await (
      await client.request("/v1/opaque/login/start", "POST", {
        purpose: "unlock",
        message: start.startLoginRequest,
      })
    ).json(),
  );

  const finish = await p.opaqueFinishLogin({
    password,
    loginResponse: body.message,
    clientLoginState: start.clientLoginState,
    identifiers,
  });

  if (!finish) throw new EnvdenError("UNAUTHORIZED", "Password login failed");

  return { kind: "login" as const, purpose: "unlock" as const, message: finish.finishLoginRequest };
}
