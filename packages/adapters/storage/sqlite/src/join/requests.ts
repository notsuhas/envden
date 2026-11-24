import type { IJoinClaim, IStoredJoinRequest, TJoinSlot } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";
import { equal } from "../db/values.ts";

const WINDOW = 600000;

interface IRequestRow {
  number: number;
  joiner: Uint8Array;
  record: Uint8Array;
  commitment: Uint8Array;
  expires: number;
  claim_vault: Uint8Array | null;
  claim_device: Uint8Array | null;
}

export function createJoinRequests(context: TContext) {
  const { db, bytes, run } = context;

  function openJoinRequest(
    joiner: Uint8Array,
    record: Uint8Array,
    commit: Uint8Array,
    now: number,
  ): IStoredJoinRequest | undefined {
    return db
      .transaction(() => {
        run("DELETE FROM join_requests WHERE expires<=?", now);
        run("DELETE FROM join_openings WHERE at<=?", now - 3600000);

        const count =
          db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM join_openings").get()
            ?.count ?? 0;

        if (count >= 10) return undefined;

        const used = new Set(
          db
            .query<{ number: number }, []>("SELECT number FROM join_requests")
            .all()
            .map((row) => row.number),
        );

        let number = 1;
        while (used.has(number) && number <= 999) number++;
        if (number > 999) return undefined;

        run(
          "INSERT INTO join_requests VALUES(?,?,?,?,?,NULL,NULL)",
          number,
          joiner,
          record,
          commit,
          now + WINDOW,
        );

        run("INSERT INTO join_openings VALUES(?)", now);

        return { number, joiner, record, commit, expiresAt: now + WINDOW, slots: {} };
      })
      .immediate();
  }

  function joinRequests(now: number): IStoredJoinRequest[] {
    return db
      .query<IRequestRow, [number]>("SELECT * FROM join_requests WHERE expires>? ORDER BY number")
      .all(now)
      .map(readRequest);
  }

  function joinRequest(number: number, now: number): IStoredJoinRequest | undefined {
    const row = db
      .query<IRequestRow, [number, number]>(
        "SELECT * FROM join_requests WHERE number=? AND expires>?",
      )
      .get(number, now);

    return row ? readRequest(row) : undefined;
  }

  function readRequest(row: IRequestRow): IStoredJoinRequest {
    const slots: IStoredJoinRequest["slots"] = {};

    for (const slot of ["offer", "reveal"] satisfies TJoinSlot[]) {
      const message = bytes(
        "SELECT bytes FROM join_slots WHERE number=? AND slot=?",
        row.number,
        slot,
      );

      if (message) slots[slot] = message;
    }

    return {
      number: row.number,
      joiner: row.joiner,
      record: row.record,
      commit: row.commitment,
      expiresAt: row.expires,
      ...(row.claim_vault && row.claim_device
        ? { claim: { vault: row.claim_vault, device: row.claim_device } }
        : {}),
      slots,
    };
  }

  function writeJoinRequest(
    number: number,
    slot: TJoinSlot,
    message: Uint8Array,
    now: number,
    claim?: IJoinClaim,
  ) {
    return db
      .transaction(() => {
        const request = joinRequest(number, now);
        if (!request) return "closed" as const;
        const prior = request.slots[slot];
        if (prior && equal(prior, message)) return "identical" as const;

        if (prior || message.length > 4096) {
          closeJoinRequest(number);

          return "closed" as const;
        }

        if (slot === "reveal" && !request.slots.offer) return "out-of-order" as const;
        run("INSERT INTO join_slots VALUES(?,?,?)", number, slot, message);

        if (claim)
          run(
            "UPDATE join_requests SET claim_vault=?,claim_device=? WHERE number=?",
            claim.vault,
            claim.device,
            number,
          );

        return "written" as const;
      })
      .immediate();
  }

  function closeJoinRequest(number: number): void {
    run("DELETE FROM join_requests WHERE number=?", number);
  }

  return { openJoinRequest, joinRequests, joinRequest, writeJoinRequest, closeJoinRequest };
}
