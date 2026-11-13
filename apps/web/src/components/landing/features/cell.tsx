import { InView } from "@/components/landing/ui/motion/in-view.tsx";
import type { ReactNode } from "react";

interface IFeatureCell {
  title: string;
  body: ReactNode;
  preview: ReactNode;
}

export function FeatureCell(props: IFeatureCell) {
  const { title, body, preview } = props;

  return (
    <InView className="den-cell flex flex-col p-5 sm:p-8">
      <div className="flex flex-1 items-center pb-6 sm:pb-8">
        <div className="w-full">{preview}</div>
      </div>
      <h3 className="den-heading text-xl text-den-ink">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-pretty text-den-muted">{body}</p>
    </InView>
  );
}
