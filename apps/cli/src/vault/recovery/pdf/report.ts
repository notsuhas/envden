import type { IReplacementKit } from "../../../admin/recovery/credentials.ts";
import { consent } from "../../../output/prompts/questions.ts";
import { homePath } from "../../../output/home-path.ts";
import { printKit, printKitSaved } from "../../../output/render/devices/kit.ts";
import { openBrowser } from "../../../ui/browser.ts";

import { kitFolder } from "./folder.ts";
import { renderKit } from "./layout.ts";
import { kitDocument } from "./model.ts";
import { writeKitPdf } from "./save.ts";

interface IKitReport {
  userHome: string;
  deviceName: string;
  now: number;
}

export async function reportKit(kit: IReplacementKit, report: IKitReport) {
  const path = await saveKit(kit, report).catch(() => undefined);

  if (!path) {
    console.error("envden: Couldn't write the recovery kit file; save the kit printed below");
    printKit(kit);

    // keep the kit on screen until it's saved, instead of scrolling it away with the next questions
    while (process.stdin.isTTY && !(await consent("Saved the recovery kit?", false)));

    return;
  }

  printKitSaved(homePath(path, report.userHome), "pdf");

  if (process.stdin.isTTY && (await consent("Open it now?", true)) && !(await openBrowser(path)))
    console.error("envden: Couldn't open the kit; open the file above yourself");
}

async function saveKit(kit: IReplacementKit, report: IKitReport) {
  const bytes = await renderKit(kitDocument(kit, new Date(report.now), report.deviceName));

  return writeKitPdf(await kitFolder(report.userHome), kit.vaultId, bytes);
}
