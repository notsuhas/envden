import { writeChannel } from "./channels/output.ts";

await writeChannel("homebrew-formula", process.argv.slice(2));
