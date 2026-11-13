import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DOCS_CONTENT_ROUTE, DOCS_ROUTE } from "@/lib/routes.ts";

const negotiatedPath = rewritePath(
  `${DOCS_ROUTE}{/*path}`,
  `${DOCS_CONTENT_ROUTE}{/*path}/content.md`,
);

const suffixedPath = rewritePath(
  `${DOCS_ROUTE}{/*path}.md`,
  `${DOCS_CONTENT_ROUTE}{/*path}/content.md`,
);

export default function proxy(request: NextRequest) {
  const suffixed = suffixedPath.rewrite(request.nextUrl.pathname);
  if (suffixed) return NextResponse.rewrite(new URL(suffixed, request.nextUrl));

  if (!isMarkdownPreferred(request)) return NextResponse.next();

  const negotiated = negotiatedPath.rewrite(request.nextUrl.pathname);
  if (!negotiated) return NextResponse.next();

  // the same URL has an HTML and a Markdown form, selected by Accept
  return NextResponse.rewrite(new URL(negotiated, request.nextUrl), {
    headers: { Vary: "Accept" },
  });
}
