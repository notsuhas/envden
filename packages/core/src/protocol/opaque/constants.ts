export const KS = { "argon2id-custom": { memory: 65536, iterations: 3, parallelism: 4 } };

export const OPAQUE_LENGTHS = {
  serverSetup: 128,
  clientRegistrationState: 64,
  registrationRequest: 32,
  registrationResponse: 64,
  registrationRecord: 192,
  exportKey: 64,
  serverStaticPublicKey: 32,
  clientLoginState: 192,
  startLoginRequest: 96,
  serverLoginState: 128,
  loginResponse: 320,
  finishLoginRequest: 64,
  sessionKey: 64,
};
