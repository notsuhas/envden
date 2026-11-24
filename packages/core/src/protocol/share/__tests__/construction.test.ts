import { expect, test } from "bun:test";
import { createDecipheriv } from "node:crypto";
import * as p from "../../index.ts";

const counting = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const share = p.newShare(counting);

const plaintext = new TextEncoder().encode("# comment\nAPI_KEY=dummy\n");

test("a share is version, nonce and AES-256-GCM bound to its ID", () => {
  const box = p.sealShare(share, plaintext, counting);

  expect(box[0]).toBe(1);
  expect(box.length).toBe(1 + 12 + plaintext.length + 16);
  expect(p.openShare(share, box)).toEqual(plaintext);

  // An independent AES-GCM reads it with the documented associated data.
  const label = new TextEncoder().encode("envden/v2/share");
  const ad = p.concat(p.u32.write(label.length), label, Uint8Array.of(1), share.id);
  const decipher = createDecipheriv("aes-256-gcm", share.key, box.subarray(1, 13));
  decipher.setAAD(ad);
  decipher.setAuthTag(box.subarray(-16));

  expect(Buffer.concat([decipher.update(box.subarray(13, -16)), decipher.final()])).toEqual(
    Buffer.from(plaintext),
  );
});

test("a different ID, key, version or any flipped byte fails to open", () => {
  const box = p.sealShare(share, plaintext);
  const other = p.newShare();

  expect(() => p.openShare({ ...share, id: other.id }, box)).toThrow("Unable to decrypt share");
  expect(() => p.openShare({ ...share, key: other.key }, box)).toThrow("Unable to decrypt share");

  expect(() => p.openShare(share, p.concat(Uint8Array.of(2), box.subarray(1)))).toThrow(
    "Unknown share version",
  );

  for (const index of [1, 13, box.length - 1]) {
    const tampered = box.slice();
    tampered[index]! ^= 1;
    expect(() => p.openShare(share, tampered)).toThrow();
  }

  expect(() => p.openShare(share, box.subarray(0, 12))).toThrow("Truncated data");
});

test("share text is strict unpadded base64url", () => {
  expect(p.shareText(share.id)).toBe("AAECAwQFBgcICQoLDA0ODw");
  expect(p.readShareText("AAECAwQFBgcICQoLDA0ODw", 16)).toEqual(share.id);

  for (const text of [
    "AAECAwQFBgcICQoLDA0ODw==",
    "AAECAwQFBgcICQoLDA0ODx",
    "AAECAwQFBgcICQoLDA0OD",
    "AAECAwQFBgcICQoLDA0O+w",
    "",
  ])
    expect(() => p.readShareText(text, 16)).toThrow("Invalid share link");
});
