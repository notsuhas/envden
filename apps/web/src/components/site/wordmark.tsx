import { SITE_NAME } from "@/lib/site.ts";

export function Wordmark() {
  return (
    <span className="font-display text-lg font-semibold tracking-tight">
      <span className="text-den-lantern">.</span>
      {SITE_NAME}
    </span>
  );
}
