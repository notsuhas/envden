import { createProgram } from "../../src/program.ts";
import { collectCommands } from "./collect.ts";
import { renderReference } from "./render.ts";

export const REFERENCE_PAGE = new URL("../../../web/content/docs/cli.mdx", import.meta.url);

export function referencePage(now: () => number): string {
  return renderReference(collectCommands(createProgram(now)));
}
