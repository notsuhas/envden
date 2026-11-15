const MAX_BYTES = 64;

const encoder = new TextEncoder();

export function fitDeviceName(name: string, reserved = 0) {
  let fitted = "";
  let bytes = 0;

  for (const character of name) {
    bytes += encoder.encode(character).length;
    if (bytes > MAX_BYTES - reserved) break;
    fitted += character;
  }

  return fitted;
}
