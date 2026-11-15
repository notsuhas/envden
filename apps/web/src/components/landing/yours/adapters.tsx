import { OutLink } from "@/components/landing/ui/links/out-link.tsx";
import { ADAPTERS_GUIDE_URL } from "@/lib/site.ts";

const ADAPTERS = [
  { kind: "network", today: "tailscale", next: "netbird · pangolin · plain LAN" },
  { kind: "storage", today: "sqlite", next: "yours" },
];

export function Adapters() {
  return (
    <div className="mt-6 max-w-xl">
      <ul className="border border-den-line font-mono text-[12px] leading-6">
        {ADAPTERS.map((adapter) => (
          <li
            key={adapter.kind}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 border-b border-den-line px-3 py-1.5 last:border-b-0 sm:grid-cols-[4.5rem_6rem_minmax(0,1fr)]"
          >
            <span className="text-den-muted">{adapter.kind}</span>
            <span className="text-den-lantern">{adapter.today}</span>
            <span className="col-start-2 text-den-muted sm:col-start-auto">
              next: {adapter.next}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4">
        <OutLink href={ADAPTERS_GUIDE_URL}>Write an adapter</OutLink>
      </p>
    </div>
  );
}
