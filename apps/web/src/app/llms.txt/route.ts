import { docsLlms } from "@/lib/source.ts";

export const revalidate = false;

export function GET() {
  return new Response(docsLlms.index());
}
