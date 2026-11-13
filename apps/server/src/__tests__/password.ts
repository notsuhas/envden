import * as p from "@envden/core/protocol";

export async function passwordRecord(setup: string, vaultId: Uint8Array) {
  const start = await p.opaqueStartRegistration("server test password");

  const response = await p.opaqueRegistrationResponse({
    serverSetup: setup,
    registrationRequest: start.registrationRequest,
    userIdentifier: p.unlockIdentifiers(vaultId).userIdentifier,
  });

  const finish = await p.opaqueFinishRegistration({
    password: "server test password",
    clientRegistrationState: start.clientRegistrationState,
    registrationResponse: response.registrationResponse,
    identifiers: p.unlockIdentifiers(vaultId).identifiers,
  });

  return Buffer.from(finish.registrationRecord, "base64url");
}
