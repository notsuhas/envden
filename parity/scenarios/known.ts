// Current reference behaviour for decided bugs in /docs/parity.md; flip each once the fix lands.
export const known = {
  // B15: switch refuses instead of unlocking against the destination.
  switchUnlocks: false,
  // B1: a control character in a device name fails late with a generic "Invalid string".
  controlCharacterName: 1,
  // B12: versions above 2^53-1 round instead of failing as invalid input.
  hugeRestoreVersion: 1,
  // B22: env-file patterns outside the shared grammar are accepted.
  unsupportedPattern: 0,
  // B10: Object.prototype names as alias targets are refused.
  prototypeAliasTarget: 3,
  // B19: Ctrl-D on a prompt hangs until Ctrl-C (130).
  eofCancels: false,
  // B3: HEAD on GET routes answers 404.
  headStatus: 404,
};
