import { docsLlms } from "@/lib/source.ts";

export const revalidate = false;

export async function GET() {
  return new Response(await docsLlms.full());
}
