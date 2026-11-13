import { client, ready } from "@serenity-kit/opaque";

import { normPw } from "../encoding/strings.ts";

import { KS } from "./constants.ts";
import { check } from "./message.ts";

export async function opaqueStartRegistration(password: string) {
  await ready;
  const result = client.startRegistration({ password: normPw(password) });
  check(result.clientRegistrationState, "clientRegistrationState");
  check(result.registrationRequest, "registrationRequest");

  return result;
}

export async function opaqueFinishRegistration(
  params: Omit<client.FinishRegistrationParams, "keyStretching">,
) {
  check(params.registrationResponse, "registrationResponse");
  check(params.clientRegistrationState, "clientRegistrationState");
  await ready;

  const result = client.finishRegistration({
    ...params,
    password: normPw(params.password),
    keyStretching: KS,
  });

  check(result.registrationRecord, "registrationRecord");
  check(result.exportKey, "exportKey");
  check(result.serverStaticPublicKey, "serverStaticPublicKey");

  return result;
}

export async function opaqueStartLogin(password: string) {
  await ready;
  const result = client.startLogin({ password: normPw(password) });
  check(result.clientLoginState, "clientLoginState");
  check(result.startLoginRequest, "startLoginRequest");

  return result;
}

export async function opaqueFinishLogin(params: Omit<client.FinishLoginParams, "keyStretching">) {
  check(params.clientLoginState, "clientLoginState");
  check(params.loginResponse, "loginResponse");
  await ready;

  const result = client.finishLogin({
    ...params,
    password: normPw(params.password),
    keyStretching: KS,
  });

  if (result) {
    check(result.finishLoginRequest, "finishLoginRequest");
    check(result.sessionKey, "sessionKey");
    check(result.exportKey, "exportKey");
    check(result.serverStaticPublicKey, "serverStaticPublicKey");
  }

  return result;
}
