import { expect, test } from "bun:test";
import { newShare, readShareText, sealShare, shareText } from "@envden/core/protocol";
import { decryptShare, linkComplete } from "../decrypt.ts";

const plaintext = new TextEncoder().encode("# dummy\nAPI_KEY=not-a-real-secret\n");

test("the page's WebCrypto opens what the CLI sealed with @noble/ciphers", async () => {
  const share = newShare();
  const box = sealShare(share, plaintext);
  const key = shareText(share.key);
  const id = shareText(share.id);

  expect(await decryptShare(key, id, box)).toEqual(plaintext);

  const tampered = box.slice();
  tampered[20]! ^= 1;

  for (const [keyText, idText, bytes] of [
    [key, shareText(newShare().id), box],
    [shareText(newShare().key), id, box],
    [key, id, tampered],
    [key.slice(0, -2), id, box],
    [`${key}=`, id, box],
  ] as const)
    await Promise.resolve(expect(decryptShare(keyText, idText, bytes)).rejects.toThrow());
});

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

test("Open is offered only for a link the CLI would also accept", () => {
  const share = newShare();
  const key = shareText(share.key);
  const id = shareText(share.id);
  // The last character of a 32-byte key carries two padding bits, which must be zero.
  const strayBits = key.slice(0, -1) + ALPHABET[ALPHABET.indexOf(key.at(-1)!) | 1];

  expect(linkComplete(key, id)).toBe(true);
  expect(() => readShareText(strayBits, 32)).toThrow();

  for (const [keyText, idText] of [
    ["", id],
    [key.slice(0, -1), id],
    [`${key}A`, id],
    [`${key}=`, id],
    [key.replace(/.$/, "+"), id],
    [strayBits, id],
    [key, id.slice(1)],
  ])
    expect(linkComplete(keyText!, idText!)).toBe(false);
});
