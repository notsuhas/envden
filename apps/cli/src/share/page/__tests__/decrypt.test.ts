import { expect, test } from "bun:test";
import { newShare, sealShare, shareText } from "@envden/core/protocol";
import { decryptShare } from "../decrypt.ts";

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
