const vectors = {
  hpke: {
    info: "4f6465206f6e2061204772656369616e2055726e",
    skRm: "8057991eef8f1f1af18f4a9491d16a1ce333f695d4db8e38da75975c4478e0fb",
    skEm: "f4ec9b33b792c372c1d2c2063507b684ef925b8c75a42dbcbf57d63ccd381600",
    pkRm: "4310ee97d88cc1f088a5576c77ab0cf5c3ac797f3d95139c6c84b5429c59662a",
    pkEm: "1afa08d3dec047a643885163f1180476fa7ddb54c6a8029ea33f95796bf2ac4a",
    enc: "1afa08d3dec047a643885163f1180476fa7ddb54c6a8029ea33f95796bf2ac4a",
    aad: "436f756e742d30",
    ct: "1c5250d8034ec2b784ba2cfd69dbdb8af406cfe3ff938e131f0def8c8b60b4db21993c62ce81883d2dd1b51a28",
    nonce: "5c4d98150661b848853b547f",
    pt: "4265617574792069732074727574682c20747275746820626561757479",
  },
  xchacha: {
    key: "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f",
    nonce: "07000000404142434445464748494a4b4c4d4e4f50515253",
    ad: "50515253c0c1c2c3c4c5c6c7",
    message:
      "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
    ct: "f8ebea4875044066fc162a0604e171feecfb3d20425248563bcfd5a155dcc47bbda70b86e5ab9b55002bd1274c02db35321acd7af8b2e2d25015e136b7679458e9f43243bf719d639badb5feac03f80a19a96ef10cb1d15333a837b90946ba3854ee74da3f2585efc7e1e170e17e15e563e77601f4f85cafa8e5877614e143e68420",
  },
  hkdf: {
    ikm: "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b",
    salt: "000102030405060708090a0b0c",
    info: "f0f1f2f3f4f5f6f7f8f9",
    okm: "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
  },
  hmac: {
    key: "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b",
    message: "Hi There",
    hash: "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  },
  ed25519: {
    seed: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
    public: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    signature:
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
  },
  x25519: {
    secret: "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a",
    public: "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a",
  },
  argon2id: {
    password: "password",
    salt: "somesalt",
    memorySize: 256,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
    hash: "9dfeb910e80bad0311fee20f9c0e2b12c17987b4cac90c2ef54d5b3021c68bfe",
  },
  sources: [
    "https://www.rfc-editor.org/rfc/rfc5869#appendix-A.1",
    "https://www.rfc-editor.org/rfc/rfc4231#section-4.2",
    "https://www.rfc-editor.org/rfc/rfc8032#section-7.1",
    "https://www.rfc-editor.org/rfc/rfc7748#section-6.1",
    "https://github.com/cfrg/draft-irtf-cfrg-hpke/blob/master/test-vectors.json",
    "https://github.com/jedisct1/libsodium/blob/master/test/default/aead_xchacha20poly1305.c",
    "https://github.com/P-H-C/phc-winner-argon2/blob/master/src/test.c",
  ],
};

await Bun.write(new URL("./known.json", import.meta.url), JSON.stringify(vectors, null, 2) + "\n");

export {};
