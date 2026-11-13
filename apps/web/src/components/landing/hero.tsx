import { ButtonLink } from "@/components/landing/ui/button-link.tsx";
import { TripStage } from "@/components/landing/trip/stage.tsx";
import { Reveal } from "@/components/landing/ui/reveal.tsx";
import { DOCS_ROUTE } from "@/lib/routes.ts";
import { WIP_NOTICE } from "@/lib/site.ts";

export function Hero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-16 pb-20 md:pt-24">
      <Reveal>
        <p className="font-mono text-sm text-den-muted">
          <span className="text-den-lantern"># </span>
          {WIP_NOTICE}
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <h1 className="mt-6 max-w-4xl font-display text-5xl leading-[0.95] font-semibold tracking-tight text-balance text-den-ink sm:text-6xl md:text-7xl">
          Your .env files, on every machine you own.
        </h1>
      </Reveal>
      <Reveal delay={0.16}>
        <p className="mt-6 max-w-2xl text-lg text-den-muted md:text-xl">
          envden syncs whole .env files across your own machines, comments and blank lines included.
          They're end-to-end encrypted and go through a server you host, over Tailscale.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={DOCS_ROUTE}>Read the docs</ButtonLink>
          <ButtonLink href="#how-it-works" variant="quiet">
            How it works
          </ButtonLink>
        </div>
      </Reveal>
      <Reveal delay={0.28} className="mt-14 md:mt-20">
        <TripStage />
      </Reveal>
    </section>
  );
}
