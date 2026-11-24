// PROTOCOL § 16 with WebCrypto, so the page needs no library.
const LABEL = new TextEncoder().encode("envden/v2/share");

const VERSION = 1;

// Checked before Open is offered, since a claim uses the link up.
export function linkComplete(keyText: string, idText: string): boolean {
  return readText(keyText, 32) !== undefined && readText(idText, 16) !== undefined;
}

export async function decryptShare(keyText: string, idText: string, box: Uint8Array) {
  const key = readText(keyText, 32);
  const id = readText(idText, 16);

  if (!key || !id || box[0] !== VERSION || box.length < 29) throw new Error("Not an envden share");

  const ad = new Uint8Array(4 + LABEL.length + 1 + id.length);
  new DataView(ad.buffer).setUint32(0, LABEL.length);
  ad.set(LABEL, 4);
  ad[4 + LABEL.length] = VERSION;
  ad.set(id, 5 + LABEL.length);

  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
  const iv = box.slice(1, 13);

  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: ad },
    cryptoKey,
    box.slice(13),
  );

  return new Uint8Array(plain);
}

// Strict like the CLI: unpadded base64url of exactly `length` bytes, with no stray trailing bits.
function readText(text: string, length: number): Uint8Array<ArrayBuffer> | undefined {
  if (text.length !== Math.ceil((length * 4) / 3) || !/^[A-Za-z0-9_-]*$/.test(text))
    return undefined;

  const padding = "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/") + padding);
  const canonical = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

  return canonical === text ? Uint8Array.from(binary, (char) => char.charCodeAt(0)) : undefined;
}
