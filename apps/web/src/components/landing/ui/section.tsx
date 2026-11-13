import type { ReactNode } from "react";
import { Reveal } from "@/components/landing/ui/motion/reveal.tsx";

interface ISection {
  id: string;
  title: ReactNode;
  body?: string;
  chip?: string;
  children: ReactNode;
}

export function Section(props: ISection) {
  const { id, title, body, chip, children } = props;

  return (
    <section id={id} data-section={id} className="den-section scroll-mt-28">
      <Reveal className="px-5 pt-12 pb-8 sm:px-8 sm:pt-16 sm:pb-10 lg:pt-20">
        {chip ? (
          <p className="den-chip mb-5">
            <span className="h-1.5 w-1.5 bg-den-lantern" aria-hidden="true" />
            {chip}
          </p>
        ) : null}
        <h2 className="max-w-4xl den-display text-[2rem] text-balance text-den-ink sm:text-[2.75rem] lg:text-[3.25rem]">
          {title}
        </h2>
        {body ? (
          <p className="mt-4 max-w-2xl text-base text-pretty text-den-muted sm:text-lg">{body}</p>
        ) : null}
      </Reveal>
      {children}
    </section>
  );
}
