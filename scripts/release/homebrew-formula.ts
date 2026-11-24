import { writeHomebrewFormula } from "./channels/output.ts";

await writeHomebrewFormula(process.argv.slice(2));
