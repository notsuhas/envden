import { createAdapters } from "../../adapters.ts";
import { paths } from "../../settings/paths.ts";
import { Command } from "@commander-js/extra-typings";
import { doctor } from "../../diagnostics/doctor.ts";

export const doctorCommand = new Command("doctor").option("--json").action(async (options) => {
  const adapters = createAdapters(undefined, Date.now);
  const report = await doctor(adapters, paths(adapters.home));
  console.log(options.json ? JSON.stringify(report) : JSON.stringify(report, null, 2));
});
