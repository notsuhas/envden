import { REFERENCE_PAGE, referencePage } from "./reference/page.ts";

await Bun.write(REFERENCE_PAGE, referencePage(Date.now));
