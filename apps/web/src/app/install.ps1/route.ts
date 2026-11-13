import { installScriptResponse } from "@/lib/install/script.ts";

export const dynamic = "force-static";

export function GET() {
  return installScriptResponse("install.ps1");
}
