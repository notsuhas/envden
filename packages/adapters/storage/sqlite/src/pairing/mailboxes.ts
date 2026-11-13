import type { IStoredMailbox, TMailboxSlot } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";
import { equal } from "../db/values.ts";

interface IMailboxRow {
  number: number;
  device: Uint8Array;
  expires: number;
}

export function createMailboxes(context: TContext) {
  const { db, bytes, run } = context;

  function openMailbox(
    vault: Uint8Array,
    device: Uint8Array,
    now: number,
  ): IStoredMailbox | undefined {
    return db
      .transaction(() => {
        run("DELETE FROM mailboxes WHERE expires<=?", now);
        run("DELETE FROM openings WHERE at<=?", now - 3600000);

        const count =
          db
            .query<{ count: number }, [Uint8Array]>(
              "SELECT COUNT(*) AS count FROM openings WHERE vault=?",
            )
            .get(vault)?.count ?? 0;

        if (count >= 10) return undefined;

        const used = new Set(
          db
            .query<{ number: number }, []>("SELECT number FROM mailboxes")
            .all()
            .map((row) => row.number),
        );

        let number = 1;
        while (used.has(number) && number <= 999) number++;
        if (number > 999) return undefined;
        run("INSERT INTO mailboxes VALUES(?,?,?,?)", number, vault, device, now + 600000);
        run("INSERT INTO openings VALUES(?,?)", vault, now);

        return { number, device, expiresAt: now + 600000, slots: {} };
      })
      .immediate();
  }

  function mailbox(vault: Uint8Array, number: number, now: number): IStoredMailbox | undefined {
    const row = db
      .query<IMailboxRow, [Uint8Array, number, number]>(
        "SELECT * FROM mailboxes WHERE vault=? AND number=? AND expires>?",
      )
      .get(vault, number, now);

    if (!row) return undefined;
    const slots: IStoredMailbox["slots"] = {};

    for (const slot of ["KE1", "KE2", "KE3", "PairJoiner"] satisfies TMailboxSlot[]) {
      const message = bytes("SELECT bytes FROM slots WHERE number=? AND slot=?", number, slot);
      if (message) slots[slot] = message;
    }

    return { number, device: row.device, expiresAt: row.expires, slots };
  }

  function writeMailbox(
    vault: Uint8Array,
    number: number,
    slot: TMailboxSlot,
    bytes: Uint8Array,
    now: number,
  ) {
    return db
      .transaction(() => {
        const box = mailbox(vault, number, now);
        if (!box) return "closed" as const;
        const prior = box.slots[slot];
        if (prior && equal(prior, bytes)) return "identical" as const;

        if (prior || bytes.length > 4096) {
          closeMailbox(vault, number);

          return "closed" as const;
        }

        const predecessor = {
          KE1: undefined,
          KE2: "KE1",
          KE3: "KE2",
          PairJoiner: "KE3",
        } satisfies Record<TMailboxSlot, TMailboxSlot | undefined>;

        const required = predecessor[slot];
        if (required && !box.slots[required]) return "out-of-order" as const;
        run("INSERT INTO slots VALUES(?,?,?)", number, slot, bytes);

        return "written" as const;
      })
      .immediate();
  }

  function closeMailbox(vault: Uint8Array, number: number): void {
    run("DELETE FROM mailboxes WHERE vault=? AND number=?", vault, number);
  }

  return { openMailbox, mailbox, writeMailbox, closeMailbox };
}
