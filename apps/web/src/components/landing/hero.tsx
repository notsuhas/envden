import type { CSSProperties } from "react";
import { HeroDen } from "@/components/landing/hero/den.tsx";
import { CommandBox } from "@/components/landing/install/command-box.tsx";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { ButtonLink } from "@/components/landing/ui/links/button-link.tsx";
import { OutLink } from "@/components/landing/ui/links/out-link.tsx";
import { GETTING_STARTED_ROUTE } from "@/lib/routes.ts";
import { GITHUB_URL } from "@/lib/site.ts";

function riseDelay(step: number): CSSProperties {
  return { "--rise-delay": `${step * 80}ms` } as CSSProperties;
}

export function Hero() {
  return (
    <section
      id="hero"
      data-section="hero"
      className="den-section den-cells lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]"
    >
      <div className="flex flex-col justify-center px-5 py-12 sm:px-8 sm:py-16 lg:min-h-[38rem] lg:py-20">
        <h1 className="den-rise den-display text-[2.6rem] text-balance text-den-ink sm:text-6xl xl:text-[4.75rem]">
          Your <Accent>.env files</Accent>, on every machine.
        </h1>
        <p
          className="den-rise mt-6 max-w-xl text-base text-pretty text-den-muted sm:text-lg"
          style={riseDelay(1)}
        >
          envden keeps your env files in sync across your computers. Encrypted on your machine,
          stored on a server you run. Free and open source.
        </p>
        <div
          className="den-rise mt-8 flex flex-wrap items-center gap-x-5 gap-y-3"
          style={riseDelay(2)}
        >
          <ButtonLink href={GETTING_STARTED_ROUTE}>Get started</ButtonLink>
          <OutLink href={GITHUB_URL}>Star on GitHub</OutLink>
        </div>
        <div className="den-rise mt-6" style={riseDelay(3)}>
          <CommandBox name="hero" />
        </div>
        <p className="den-rise mt-6 font-mono text-xs text-den-muted" style={riseDelay(4)}>
          MIT · self-hosted · end-to-end encrypted
        </p>
      </div>
      <div className="relative h-64 sm:h-80 lg:h-auto">
        <HeroDen />
        <span className="den-ruler absolute inset-x-0 bottom-0" aria-hidden="true" />
      </div>
    </section>
  );
}
