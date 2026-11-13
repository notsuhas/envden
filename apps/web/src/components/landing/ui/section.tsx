import type { ReactNode } from "react";
import { Reveal } from "@/components/landing/ui/reveal.tsx";

interface ISection {
  id: string;
  title: string;
  lede: string;
  children: ReactNode;
}

export function Section(props: ISection) {
  const { id, title, lede, children } = props;

  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-20 md:py-28">
      <Reveal className="max-w-2xl">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-den-ink md:text-5xl">
          {title}
        </h2>
        <p className="mt-4 text-lg text-den-muted">{lede}</p>
      </Reveal>
      {children}
    </section>
  );
}
