// PROTOCOL § 16 with WebCrypto, so the page needs no library.
const LABEL = new TextEncoder().encode("envden/v1/share");

const VERSION = 1;

export async function decryptShare(keyText: string, idText: string, box: Uint8Array) {
  const key = fromBase64Url(keyText);
  const id = fromBase64Url(idText);

  if (key.length !== 32 || id.length !== 16 || box[0] !== VERSION || box.length < 29)
    throw new Error("Not an envden share");

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

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("Not base64url");

  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (text.length % 4)) % 4);

  return Uint8Array.from(atob(base64 + padding), (char) => char.charCodeAt(0));
}
