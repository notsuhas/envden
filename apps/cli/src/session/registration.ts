import {
  opaqueStartRegistration,
  opaqueFinishRegistration,
  unlockIdentifiers,
  MessageResponseSchema,
} from "@envden/core/protocol";
import type { TClient } from "../client/request.ts";

export async function registerPassword(
  client: TClient,
  vaultId: Uint8Array,
  password: string,
): Promise<string> {
  const start = await opaqueStartRegistration(password);

  const response = await client.request("/v1/opaque/registration/start", "POST", {
    message: start.registrationRequest,
  });

  const body = MessageResponseSchema.parse(await response.json());

  const finish = await opaqueFinishRegistration({
    password,
    registrationResponse: body.message,
    clientRegistrationState: start.clientRegistrationState,
    identifiers: unlockIdentifiers(vaultId).identifiers,
  });

  await client.request("/v1/opaque/registration/finish", "POST", {
    message: finish.registrationRecord,
  });

  return finish.registrationRecord;
}
