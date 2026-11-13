export const PROTECTS = [
  "The server holds ciphertext and opaque IDs only. envden doesn't trust it to keep files secret or intact.",
  "Tailscale is transport only. Every request is signed by a device, and envden trusts no identity the network reports.",
  "A stolen server can't open the vault by guessing your password. That also needs a secret key that is never stored on any device.",
  "A folder that claims a repo's remote gets no env files until you approve it once.",
];

export const LIMITS = [
  "The server can always refuse service, and it can choose not to enforce unlock expiry.",
  "The server still sees rough file sizes, timing, the number of devices and their names.",
  "A removed device keeps whatever it already pulled. envden lists what it could read so you can rotate those credentials.",
  "Files already on a disk are protected by OS login and disk encryption, not by envden.",
  "The protocol hasn't had its separate review yet. That happens before release.",
];
