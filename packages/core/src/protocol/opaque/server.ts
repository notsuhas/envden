import { server, ready } from "@serenity-kit/opaque";

import { checkIdentifiers, checkUserIdentifier } from "./context.ts";
import { check } from "./message.ts";

export async function opaqueCreateSetup(): Promise<string> {
  await ready;

  return check(server.createSetup(), "serverSetup");
}

export async function opaqueRegistrationResponse(params: server.CreateRegistrationResponseParams) {
  checkUserIdentifier(params.userIdentifier);
  check(params.serverSetup, "serverSetup");
  check(params.registrationRequest, "registrationRequest");
  await ready;
  const result = server.createRegistrationResponse(params);
  check(result.registrationResponse, "registrationResponse");

  return result;
}

export async function opaqueServerStartLogin(
  params: Omit<server.LoginStartParams, "identifiers"> & {
    identifiers: { client: string; server: string };
  },
) {
  checkUserIdentifier(params.userIdentifier);
  check(params.serverSetup, "serverSetup");

  checkIdentifiers(params.identifiers);

  if (params.registrationRecord !== undefined && params.registrationRecord !== null)
    check(params.registrationRecord, "registrationRecord");

  check(params.startLoginRequest, "startLoginRequest");
  await ready;
  const result = server.startLogin(params);
  check(result.serverLoginState, "serverLoginState");
  check(result.loginResponse, "loginResponse");

  return result;
}

export async function opaqueServerFinishLogin(
  params: Omit<server.LoginFinishParams, "identifiers"> & {
    identifiers: { client: string; server: string };
  },
) {
  checkIdentifiers(params.identifiers);
  check(params.serverLoginState, "serverLoginState");
  check(params.finishLoginRequest, "finishLoginRequest");
  await ready;
  const result = server.finishLogin(params);
  check(result.sessionKey, "sessionKey");

  return result;
}
