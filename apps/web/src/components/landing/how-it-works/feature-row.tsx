import type { ReactNode } from "react";
import { Reveal } from "@/components/landing/ui/reveal.tsx";

interface IFeatureRow {
  title: string;
  body: string;
  figure: ReactNode;
}

export function FeatureRow(props: IFeatureRow) {
  const { title, body, figure } = props;

  return (
    <Reveal className="grid items-start gap-8 border-t border-den-line py-12 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-14">
      <div>
        <h3 className="font-display text-2xl font-semibold tracking-tight text-den-ink">{title}</h3>
        <p className="mt-3 text-den-muted">{body}</p>
      </div>
      {figure}
    </Reveal>
  );
}
