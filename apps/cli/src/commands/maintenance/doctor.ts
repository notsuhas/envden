import { Command } from "@commander-js/extra-typings";
import { doctor } from "../../diagnostics/doctor.ts";

export const doctorCommand = new Command("doctor").option("--json").action(async (options) => {
  const report = await doctor();
  console.log(options.json ? JSON.stringify(report) : JSON.stringify(report, null, 2));
});
