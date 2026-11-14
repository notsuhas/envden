import { writeChannel } from "./channels/output.ts";

await writeChannel("scoop-manifest", process.argv.slice(2));
