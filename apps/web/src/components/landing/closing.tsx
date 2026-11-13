import { DeferredArt } from "@/components/landing/art/deferred.tsx";
import { Finale } from "@/components/landing/closing/finale.tsx";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { ButtonLink } from "@/components/landing/ui/links/button-link.tsx";
import { OutLink } from "@/components/landing/ui/links/out-link.tsx";
import { Reveal } from "@/components/landing/ui/motion/reveal.tsx";
import { GETTING_STARTED_ROUTE } from "@/lib/routes.ts";
import { GITHUB_URL } from "@/lib/site.ts";

export function Closing() {
  return (
    <section id="start" data-section="start" className="den-section scroll-mt-28">
      <div className="grid items-center gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Reveal>
          <h2 className="den-display text-[2.4rem] text-balance text-den-ink sm:text-6xl">
            Stop copying <Accent>.env files</Accent> around.
          </h2>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <ButtonLink href={GETTING_STARTED_ROUTE}>Get started</ButtonLink>
            <OutLink href={GITHUB_URL}>Star on GitHub</OutLink>
          </div>
        </Reveal>
        <Finale />
      </div>
      <div className="relative h-40 border-t border-den-line sm:h-56">
        <DeferredArt kind="backdrop" />
      </div>
    </section>
  );
}
