import type { ReactNode } from "react";

interface IWindow {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  lit?: boolean;
  area?: string;
}

const HANDLE_CLASS = "h-2.5 w-2.5 shrink-0 border border-den-ink";

export function Window(props: IWindow) {
  const { title, badge, children, className = "", lit = false, area } = props;

  return (
    <figure
      className={`den-window flex min-w-0 flex-col border border-den-ink bg-den-ground ${className}`}
      data-lit={lit}
      style={area ? { gridArea: area } : undefined}
    >
      <figcaption className="flex h-7 items-center gap-2 border-b border-den-ink px-1.5">
        <span className={HANDLE_CLASS} aria-hidden="true" />
        <span className="den-hatch h-2.5 min-w-2 flex-1" aria-hidden="true" />
        <span className="min-w-0 shrink truncate font-mono text-[11px] text-den-ink">{title}</span>
        <span className="den-hatch h-2.5 min-w-2 flex-1" aria-hidden="true" />
        {badge}
        <span className={HANDLE_CLASS} aria-hidden="true" />
      </figcaption>
      {children}
    </figure>
  );
}
