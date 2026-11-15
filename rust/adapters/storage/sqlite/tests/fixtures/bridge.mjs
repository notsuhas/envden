// fallow-ignore-file unused-file -- Invoked by the Rust SQLite parity tests through Bun.
// oxlint-disable-next-line no-restricted-imports -- Cross-language tests load the frozen reference without workspace installation.
import { createSqliteStorageAdapter } from "../../../../../../packages/adapters/storage/sqlite/src/index.ts";
// oxlint-disable-next-line no-restricted-imports -- Cross-language tests load the frozen reference without workspace installation.
import { H } from "../../../../../../packages/core/src/protocol/index.ts";

const [mode, dir] = process.argv.slice(2);
const db = createSqliteStorageAdapter(dir, 0);
const b = (n) => new Uint8Array([n]);

try {
  if (mode === "write") {
    db.configureVault(b(1), { active: true, frozen: false, skRefused: false, unlockPeriod: 123 });
    db.putDevice(b(1), b(2), { unlockedUntil: 100, freshUntil: 50, clientVersion: "1.0.0" });
    db.writeState(
      b(1),
      [
        "keyring",
        "envelope",
        "skPub",
        "opaqueRecord",
        "repair-report",
        "move-session",
        "setup-issued",
        "server-identity",
        "pairing-index",
        "mailbox-joiner",
      ].map((kind) => ({ kind, key: b(3), bytes: b(4) })),
    );
    db.putBlob(b(1), b(5), b(6));
    db.commitSwap(
      b(1),
      undefined,
      {
        header: { seq: 18446744073709551615n, hash: b(7), bytes: b(8) },
        entries: [],
        bodyDigest: b(9),
        files: {
          hash: b(10),
          bytes: b(11),
          versions: [
            { fileId: b(12), version: 18446744073709551615n, blobHash: b(5), tombstone: false },
          ],
        },
      },
      1,
    );
  } else if (mode === "read") {
    if (
      db.vault(b(1)).unlockPeriod !== 123 ||
      db.device(b(1), b(2)).unlockedUntil !== 100 ||
      db.state(b(1), "keyring", b(3))[0] !== 4 ||
      db.getBlob(b(1), b(5))[0] !== 6 ||
      db.head(b(1))[0] !== 7 ||
      db.headers(b(1), 0n, 18446744073709551615n)[0].seq !== 18446744073709551615n
    )
      throw Error("Cross-runtime mismatch");
    for (const kind of [
      "keyring",
      "envelope",
      "skPub",
      "opaqueRecord",
      "repair-report",
      "move-session",
      "setup-issued",
      "server-identity",
      "pairing-index",
      "mailbox-joiner",
    ]) {
      if (db.state(b(1), kind, b(3))?.[0] !== 4) throw Error("State kind mismatch");
    }
  } else if (mode === "hash") {
    process.stdout.write(Buffer.from(H("blob", b(6))).toString("hex"));
  }
} finally {
  db.close();
}
