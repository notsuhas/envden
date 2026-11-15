import { Accent } from "@/components/landing/ui/accent.tsx";
import { Reveal } from "@/components/landing/ui/motion/reveal.tsx";
import { DeferredArt } from "@/components/landing/art/deferred.tsx";
import { Adapters } from "@/components/landing/yours/adapters.tsx";

const POINTS = [
  { value: "0", unit: "third parties", label: "holding your files" },
  { value: "1", unit: "binary", label: "your hardware" },
  { value: "$0", unit: "to pay", label: "free and MIT" },
];

export function Yours() {
  return (
    <section
      id="yours"
      data-section="yours"
      className="den-section den-cells scroll-mt-28 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <div className="flex flex-col">
        <Reveal className="flex-1 px-5 pt-12 pb-8 sm:px-8 sm:pt-16 sm:pb-10 lg:pt-20">
          <h2 className="den-display text-[2rem] text-balance text-den-ink sm:text-[2.75rem] lg:text-[3.25rem]">
            Your server. Your keys. <Accent>Your network.</Accent>
          </h2>
          <p className="mt-4 max-w-xl text-base text-pretty text-den-muted sm:text-lg">
            Run the server in Docker on a home box, or with{" "}
            <code className="font-mono text-den-ink">envden serve</code> on a laptop you already
            have. There's no envden account and nothing to pay.
          </p>
          <p className="mt-4 max-w-xl text-base text-pretty text-den-muted sm:text-lg">
            How devices reach the server and where it keeps data are both adapters, so you aren't
            tied to either. Tailscale and SQLite ship today; others can follow, or you can write
            your own.
          </p>
          <Adapters />
        </Reveal>
        <ul className="den-cells border-t border-den-line min-[420px]:grid-cols-3">
          {POINTS.map((point) => (
            <li
              key={point.value}
              className="den-cell min-w-0 px-5 py-4 text-sm text-den-ink sm:px-8"
            >
              <p className="flex flex-col font-mono text-den-lantern">
                <span className="text-[2.5rem] leading-tight tabular-nums">{point.value}</span>
                <span className="text-sm">{point.unit}</span>
              </p>
              <p className="mt-2 font-mono text-[11px] text-den-muted">{point.label}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative h-64 sm:h-72 lg:h-auto lg:min-h-[26rem]">
        <DeferredArt kind="mesh" />
      </div>
    </section>
  );
}
