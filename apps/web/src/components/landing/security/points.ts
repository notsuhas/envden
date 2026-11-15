export const SECURITY_POINTS = [
  {
    tag: "ciphertext",
    text: "Files are encrypted on your device. The server only sees ciphertext and opaque IDs.",
  },
  { tag: "OPAQUE", text: "Your master password never leaves your machine (OPAQUE)." },
  { tag: "device keys", text: "Each device has its own keys. Remove one and the keys rotate." },
  {
    tag: "approval",
    text: "Each new clone needs a yes in your terminal before it gets secrets. Its worktrees come with it.",
  },
  {
    tag: "checksums",
    text: "Updates check SHA256SUMS from the same GitHub release over HTTPS. Integrity rests on GitHub and TLS.",
  },
  { tag: "pinned", text: "Built on pinned, widely used crypto libraries. Nothing hand-rolled." },
];
