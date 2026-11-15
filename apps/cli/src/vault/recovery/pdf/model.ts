import type { IReplacementKit } from "../../../admin/recovery/credentials.ts";
import { SITE_URL } from "@envden/core/site";
import { localTime } from "../../../time/format.ts";

interface IField {
  label: string;
  value: string;
  large?: true;
}

export interface IKitDocument {
  title: string;
  details: IField[];
  fields: IField[];
  instructions: string[];
  footer: string;
}

export function kitDocument(kit: IReplacementKit, date: Date, deviceName: string): IKitDocument {
  return {
    title: "envden Recovery Kit",
    details: [
      { label: "Created", value: localTime(date.getTime()) },
      { label: "Device", value: deviceName },
    ],
    fields: [
      { label: "Vault ID", value: kit.vaultId },
      { label: "Secret key", value: kit.secretKey, large: true },
      { label: "Server", value: kit.server },
    ],
    instructions: [
      `To get back in on a new device: run envden join ${kit.server} --recovery, enter the vault ID and secret key above, then your master password.`,
      "Keep this offline, like a passport. Never write your master password on it.",
      "Anyone with this kit and your master password can open the vault.",
    ],
    footer: SITE_URL,
  };
}
