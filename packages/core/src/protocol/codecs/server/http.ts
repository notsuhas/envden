import { z } from "zod";
import { OPAQUE_LENGTHS } from "../../opaque/constants.ts";
import { opaqueMessage } from "../../opaque/message.ts";

const message = (length: number) =>
  z.string().refine((value) => {
    try {
      opaqueMessage(value, length);

      return true;
    } catch {
      return false;
    }
  });

export const LoginStartSchema = z
  .object({
    purpose: z.enum(["unlock", "kit"]),
    message: message(OPAQUE_LENGTHS.startLoginRequest),
  })
  .strict();

export const LoginFinishSchema = z
  .object({
    purpose: z.enum(["unlock", "kit"]),
    message: message(OPAQUE_LENGTHS.finishLoginRequest),
  })
  .strict();

export const RegistrationStartSchema = z
  .object({ message: message(OPAQUE_LENGTHS.registrationRequest) })
  .strict();

export const RegistrationFinishSchema = z
  .object({ message: message(OPAQUE_LENGTHS.registrationRecord) })
  .strict();

export const UnlockPeriodSchema = z
  .object({
    period: z.union([z.literal(86400000), z.literal(604800000), z.literal(2592000000), z.null()]),
  })
  .strict();

export const MailboxSlotSchema = z.enum(["KE1", "KE2", "KE3", "PairJoiner"]);

export const MailboxWriteSchema = z.object({ message: z.string().max(5462) }).strict();

export const MessageResponseSchema = z.object({ message: z.string() }).strict();

export const HelloResponseSchema = z.object({ hello: z.string() }).strict();

export const MailboxOpenedSchema = z
  .object({ number: z.number().int().min(1).max(999), expiresAt: z.number().int() })
  .strict();
