import { Command, InvalidArgumentError } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runDeviceApprove } from "../../onboarding/approve.ts";

function requestNumber(value: string) {
  if (!/^[1-9]\d{0,2}$/.test(value))
    throw new InvalidArgumentError("Use the number shown for the request.");

  return Number(value);
}

export const deviceApproveCommand = new Command("approve")
  .description("Let a new device join after checking both screens show the same words")
  .argument("[request]", "Join request number, when several devices are waiting", requestNumber)
  .action(async (request) => {
    await runDeviceApprove(createAdapters(undefined, Date.now), Date.now, request);
  });
