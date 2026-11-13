import { ErrorCodeSchema } from "../../../errors/error-code.ts";
import { z } from "zod";
import { LoginFinishSchema, RegistrationFinishSchema } from "./http.ts";

const binary = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const PendingResponseSchema = z.object({ kind: z.literal("pending") }).strict();

export const DevicesResponseSchema = z
  .object({
    devices: z.array(
      z
        .object({ id: binary, clientVersion: z.string().nullable(), confirmed: z.boolean() })
        .strict(),
    ),
  })
  .strict();

export const ObjectsResponseSchema = z.object({ objects: z.array(binary) }).strict();

export const CommitResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("committed") }).strict(),
  z.object({ kind: z.literal("retry-of-committed") }).strict(),
  z.object({ kind: z.literal("head-moved"), head: binary.optional() }).strict(),
]);

export const RepairStatusSchema = z.object({ restoredHead: binary, repairId: binary }).strict();

export const TransferResponseSchema = z
  .object({ kind: z.enum(["moving", "frozen", "unfrozen", "uploaded", "stored", "updated"]) })
  .strict();

export const RepairFinishSchema = z.discriminatedUnion("kind", [
  LoginFinishSchema.extend({
    kind: z.literal("login"),
    purpose: z.literal("unlock"),
    swap: binary,
  }),
  RegistrationFinishSchema.extend({ kind: z.literal("registration"), swap: binary }),
]);

export const ErrorResponseSchema = z
  .object({ error: ErrorCodeSchema, hint: z.string().optional() })
  .strict();

export const LoginFinishResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ticket") }).strict(),
  z.object({ kind: z.literal("staged") }).strict(),
  z
    .object({
      kind: z.literal("unlocked"),
      unlockedUntil: z.number().int().nonnegative().nullable(),
      freshUntil: z.number().int().nonnegative(),
    })
    .strict(),
]);

export const RegistrationResponseSchema = z.object({ kind: z.literal("registered") }).strict();
export const MailboxClosedSchema = z.object({ kind: z.literal("closed") }).strict();
