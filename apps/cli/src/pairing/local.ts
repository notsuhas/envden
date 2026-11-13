import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

export async function preparePairing(pin: Uint8Array, mailbox: number) {
  const code = p.generatePairingCode(mailbox);
  const { password } = p.normalizePairingCode(code);
  const serverSetup = await p.opaqueCreateSetup();
  const identifiers = p.pairingIdentifiers(pin, mailbox);
  const start = await p.opaqueStartRegistration(password);

  const response = await p.opaqueRegistrationResponse({
    serverSetup,
    userIdentifier: identifiers.userIdentifier,
    registrationRequest: start.registrationRequest,
  });

  const finish = await p.opaqueFinishRegistration({
    password,
    registrationResponse: response.registrationResponse,
    clientRegistrationState: start.clientRegistrationState,
    identifiers: identifiers.identifiers,
  });

  let used = false;

  return {
    code,
    answer: async (message: string) => {
      if (used) throw new EnvdenError("UNAUTHORIZED", "Pairing code already used");
      used = true;

      return p.opaqueServerStartLogin({
        serverSetup,
        registrationRecord: finish.registrationRecord,
        startLoginRequest: message,
        ...identifiers,
      });
    },
  };
}

export async function finishApprover(
  pin: Uint8Array,
  mailbox: number,
  state: string,
  message: string,
) {
  const result = await p.opaqueServerFinishLogin({
    serverLoginState: state,
    finishLoginRequest: message,
    identifiers: p.pairingIdentifiers(pin, mailbox).identifiers,
  });

  return p.pairingChannelKeys(new Uint8Array(Buffer.from(result.sessionKey, "base64url")));
}
