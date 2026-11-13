import type { ReactNode } from "react";

interface IPane {
  device: string;
  location: string;
  footer: string;
  children: ReactNode;
}

export function Pane(props: IPane) {
  const { device, location, footer, children } = props;

  return (
    <figure className="flex min-w-0 flex-col rounded-xl border border-den-line bg-den-surface">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-den-line px-4 py-2.5">
        <span className="text-sm font-medium text-den-ink">{device}</span>
        <span className="font-mono text-xs text-den-muted">{location}</span>
      </figcaption>
      <div className="flex-1 overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6">
        {children}
      </div>
      <p className="border-t border-den-line px-4 py-2 text-xs text-den-muted">{footer}</p>
    </figure>
  );
}
