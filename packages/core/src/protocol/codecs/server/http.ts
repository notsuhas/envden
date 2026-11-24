import { z } from "zod";

const id = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]+$/);

const number = z.number().int().min(1).max(999);

export const JoinSlotSchema = z.enum(["offer", "reveal"]);

export const JoinOpenSchema = z.object({ commit: id }).strict();

export const JoinWriteSchema = z.object({ message: z.string().max(5462) }).strict();

export const MessageResponseSchema = z.object({ message: z.string() }).strict();

export const HelloResponseSchema = z.object({ hello: z.string() }).strict();

export const JoinOpenedSchema = z.object({ number, expiresAt: z.number().int() }).strict();

export const JoinRequestsSchema = z
  .object({
    requests: z.array(
      z
        .object({ number, name: z.string().max(256), commit: id, expiresAt: z.number().int() })
        .strict(),
    ),
  })
  .strict();

export const JoinSlotResponseSchema = z.union([
  z.object({ message: z.string(), expiresAt: z.number().int() }).strict(),
  z.object({ kind: z.literal("pending"), expiresAt: z.number().int() }).strict(),
]);

export const JoinWriteResponseSchema = z
  .object({ kind: z.enum(["written", "identical"]), expiresAt: z.number().int() })
  .strict();

export const RecoveryTicketSchema = z.object({ proofPub: id }).strict();

export const RecoveryTicketResponseSchema = z.object({ vaultId: id }).strict();
