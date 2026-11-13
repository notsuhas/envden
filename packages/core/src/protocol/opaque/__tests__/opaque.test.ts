import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/opaque.json";

test("OPAQUE stored state finish calls agree", async () => {
  const result = await p.opaqueFinishLogin({
    password: "password",
    clientLoginState: vector.login.clientLoginState,
    loginResponse: vector.login.loginResponse,
    identifiers: vector.ids.identifiers,
  });

  expect(result?.sessionKey).toBe(vector.login.sessionKey);

  const server = await p.opaqueServerFinishLogin({
    serverLoginState: vector.login.serverLoginState,
    finishLoginRequest: vector.login.finishLoginRequest,
    identifiers: vector.ids.identifiers,
  });

  expect(result).toBeDefined();
  if (!result) throw new Error("Login failed");
  expect(server.sessionKey).toBe(result.sessionKey);

  expect(
    await p.opaqueFinishLogin({
      password: "wrong",
      clientLoginState: vector.login.clientLoginState,
      loginResponse: vector.login.loginResponse,
      identifiers: vector.ids.identifiers,
    }),
  ).toBeUndefined();
}, 15000);

test("OPAQUE registration stored states", async () => {
  const result = await p.opaqueFinishRegistration({
    password: "password",
    clientRegistrationState: vector.registration.clientRegistrationState,
    registrationResponse: vector.registration.registrationResponse,
    identifiers: vector.ids.identifiers,
  });

  expect(result.serverStaticPublicKey).toBe(vector.registration.serverStaticPublicKey);

  expect(p.opaqueMessage(result.registrationRecord, p.OPAQUE_LENGTHS.registrationRecord)).toBe(
    result.registrationRecord,
  );
}, 15000);

test("OPAQUE malformed strings never reach WASM", async () => {
  for (const value of ["!", "AA=", "AB", "AAAA"]) {
    expect(() => p.opaqueMessage(value, 1)).toThrow();

    expect(
      await p
        .opaqueServerFinishLogin({
          identifiers: vector.ids.identifiers,
          serverLoginState: value,
          finishLoginRequest: vector.login.finishLoginRequest,
        })
        .then(
          () => false,
          () => true,
        ),
    ).toBe(true);
  }

  expect(p.unlockIdentifiers(new Uint8Array(32)).identifiers.server).toBe(
    "envden/v1/unlock-server",
  );

  expect(p.pairingIdentifiers(new Uint8Array(32), 1).identifiers.client).toBe(
    "envden/v1/pair/joiner",
  );
});

test("each OPAQUE entrypoint checks external message shapes", async () => {
  const invalid = "AA",
    r = vector.registration,
    l = vector.login;

  const calls = [
    p.opaqueRegistrationResponse({
      serverSetup: invalid,
      userIdentifier: "x",
      registrationRequest: r.registrationRequest,
    }),
    p.opaqueRegistrationResponse({
      serverSetup: r.serverSetup,
      userIdentifier: "x",
      registrationRequest: invalid,
    }),
    p.opaqueFinishRegistration({
      identifiers: vector.ids.identifiers,
      password: "x",
      registrationResponse: invalid,
      clientRegistrationState: r.clientRegistrationState,
    }),
    p.opaqueFinishRegistration({
      identifiers: vector.ids.identifiers,
      password: "x",
      registrationResponse: r.registrationResponse,
      clientRegistrationState: invalid,
    }),
    p.opaqueServerStartLogin({
      identifiers: vector.ids.identifiers,
      serverSetup: r.serverSetup,
      registrationRecord: invalid,
      startLoginRequest: l.startLoginRequest,
      userIdentifier: "x",
    }),
    p.opaqueServerStartLogin({
      identifiers: vector.ids.identifiers,
      serverSetup: r.serverSetup,
      registrationRecord: r.registrationRecord,
      startLoginRequest: invalid,
      userIdentifier: "x",
    }),
    p.opaqueFinishLogin({
      identifiers: vector.ids.identifiers,
      password: "x",
      clientLoginState: invalid,
      loginResponse: l.loginResponse,
    }),
    p.opaqueFinishLogin({
      identifiers: vector.ids.identifiers,
      password: "x",
      clientLoginState: l.clientLoginState,
      loginResponse: invalid,
    }),
    p.opaqueServerFinishLogin({
      identifiers: vector.ids.identifiers,
      serverLoginState: l.serverLoginState,
      finishLoginRequest: invalid,
    }),
  ];

  for (const result of await Promise.allSettled(calls)) expect(result.status).toBe("rejected");
});

test("OPAQUE wrappers reject omitted identity context before calling WASM", async () => {
  const r = vector.registration,
    l = vector.login;

  const calls = [
    Reflect.apply(p.opaqueFinishRegistration, undefined, [
      {
        password: "password",
        clientRegistrationState: r.clientRegistrationState,
        registrationResponse: r.registrationResponse,
      },
    ]),
    Reflect.apply(p.opaqueFinishLogin, undefined, [
      {
        password: "password",
        clientLoginState: l.clientLoginState,
        loginResponse: l.loginResponse,
      },
    ]),
    Reflect.apply(p.opaqueServerStartLogin, undefined, [
      {
        serverSetup: r.serverSetup,
        registrationRecord: r.registrationRecord,
        startLoginRequest: l.startLoginRequest,
        userIdentifier: vector.ids.userIdentifier,
      },
    ]),
    Reflect.apply(p.opaqueServerFinishLogin, undefined, [
      { serverLoginState: l.serverLoginState, finishLoginRequest: l.finishLoginRequest },
    ]),
    Reflect.apply(p.opaqueRegistrationResponse, undefined, [
      { serverSetup: r.serverSetup, registrationRequest: r.registrationRequest },
    ]),
  ];

  for (const result of await Promise.allSettled(calls)) expect(result.status).toBe("rejected");

  expect(Buffer.from(r.registrationRecord, "base64url").length).toBe(
    p.OPAQUE_LENGTHS.registrationRecord,
  );
});
