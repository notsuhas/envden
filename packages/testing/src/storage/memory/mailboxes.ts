import type { IStorageAdapter, TMailboxSlot } from "@envden/core/adapters";
import { equal, hex } from "./data.ts";
import type { IMemoryContext } from "./data.ts";

export function createMailboxes(context: IMemoryContext) {
  const methods = {
    openMailbox(vault, device, now) {
      const data = context.data;

      for (const [number, entry] of data.mailboxes)
        if (entry.box.expiresAt <= now) data.mailboxes.delete(number);

      const openings = (data.openings.get(hex(vault)) ?? []).filter((at) => at > now - 3600000);
      data.openings.set(hex(vault), openings);
      if (openings.length >= 10) return undefined;
      let number = 1;
      while (data.mailboxes.has(number) && number <= 999) number++;
      if (number > 999) return undefined;
      const box = { number, device: device.slice(), expiresAt: now + 600000, slots: {} };
      data.mailboxes.set(number, { vault: hex(vault), box });
      openings.push(now);

      return structuredClone(box);
    },
    mailbox(vault, number, now) {
      const entry = context.data.mailboxes.get(number);

      return entry && entry.vault === hex(vault) && entry.box.expiresAt > now
        ? structuredClone(entry.box)
        : undefined;
    },
    closeMailbox(vault, number) {
      if (context.data.mailboxes.get(number)?.vault === hex(vault))
        context.data.mailboxes.delete(number);
    },
    writeMailbox(vault, number, slot, bytes, now) {
      const box = methods.mailbox(vault, number, now);
      if (!box) return "closed";
      const prior = box.slots[slot];
      if (prior && equal(prior, bytes)) return "identical";

      if (prior || bytes.length > 4096) {
        methods.closeMailbox(vault, number);

        return "closed";
      }

      const predecessor = {
        KE1: undefined,
        KE2: "KE1",
        KE3: "KE2",
        PairJoiner: "KE3",
      } satisfies Record<TMailboxSlot, TMailboxSlot | undefined>;

      const required = predecessor[slot];
      if (required && !box.slots[required]) return "out-of-order";
      const entry = context.data.mailboxes.get(number);
      if (!entry) throw new Error("Missing mailbox");
      entry.box.slots[slot] = bytes.slice();

      return "written";
    },
  } satisfies Pick<IStorageAdapter, "openMailbox" | "mailbox" | "closeMailbox" | "writeMailbox">;

  return methods;
}
