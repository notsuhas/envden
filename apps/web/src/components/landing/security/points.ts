export const SECURITY_POINTS = [
  {
    tag: "ciphertext",
    text: "Files are encrypted on your device. The server only sees ciphertext and random IDs.",
  },
  { tag: "OPAQUE", text: "Your master password never leaves your machine (OPAQUE)." },
  { tag: "device keys", text: "Each device has its own keys. Remove one and the keys rotate." },
  { tag: "approval", text: "Every checkout needs your approval before it gets secrets." },
  {
    tag: "checksums",
    text: "Updates check SHA256SUMS from the same GitHub release over HTTPS. Integrity rests on GitHub and TLS.",
  },
  { tag: "audited", text: "Built on audited crypto libraries. Nothing hand-rolled." },
];
