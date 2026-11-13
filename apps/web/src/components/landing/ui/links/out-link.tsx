import type { ReactNode } from "react";

interface IOutLink {
  href: string;
  children: ReactNode;
}

export function OutLink(props: IOutLink) {
  const { href, children } = props;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-[15px] font-medium text-den-ink underline decoration-den-line-strong underline-offset-[5px] transition-[text-decoration-color,color] duration-150 ease-out hover:decoration-den-lantern active:text-den-lantern"
    >
      {children}
      <span className="den-nudge" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}
