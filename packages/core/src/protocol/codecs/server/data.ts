import { ErrorCodeSchema } from "../../../errors/error-code.ts";
import { z } from "zod";

const binary = (bytes: number) =>
  z
    .string()
    .max(Math.ceil((bytes * 4) / 3))
    .regex(/^[A-Za-z0-9_-]+$/);

const id = binary(32);

// The largest object is a RepairReport listing 100,000 blobs.
const object = binary(3200182);

export const PendingResponseSchema = z.object({ kind: z.literal("pending") }).strict();

export const DevicesResponseSchema = z
  .object({
    devices: z.array(
      z.object({ id, clientVersion: z.string().nullable(), confirmed: z.boolean() }).strict(),
    ),
  })
  .strict();

export const ObjectsResponseSchema = z.object({ objects: z.array(object) }).strict();

export const CommitResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("committed") }).strict(),
  z.object({ kind: z.literal("retry-of-committed") }).strict(),
  z.object({ kind: z.literal("head-moved"), head: id.optional() }).strict(),
]);

export const RepairStatusSchema = z.object({ restoredHead: id, repairId: id }).strict();

export const TransferResponseSchema = z
  .object({ kind: z.enum(["moving", "frozen", "unfrozen", "uploaded", "stored", "updated"]) })
  .strict();

export const ErrorResponseSchema = z
  .object({ error: ErrorCodeSchema, hint: z.string().optional() })
  .strict();

export const JoinClosedSchema = z.object({ kind: z.literal("closed") }).strict();
