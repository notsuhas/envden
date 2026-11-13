import Link from "next/link";
import type { ReactNode } from "react";

interface IButtonLink {
  href: string;
  children: ReactNode;
  variant?: "primary" | "quiet";
  external?: boolean;
}

const VARIANT_CLASS = {
  primary:
    "bg-den-lantern text-den-on-lantern hover:bg-[rgba(255,210,122,1)] active:bg-[rgba(228,170,66,1)]",
  quiet:
    "border border-den-line-strong text-den-ink hover:border-[rgba(237,233,224,0.45)] hover:bg-den-surface active:bg-den-raised",
};

export function ButtonLink(props: IButtonLink) {
  const { href, children, variant = "primary", external = false } = props;

  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`inline-flex h-11 items-center gap-2 px-5 text-[15px] font-medium whitespace-nowrap transition-[background-color,border-color] duration-150 ease-out ${VARIANT_CLASS[variant]}`}
    >
      {children}
    </Link>
  );
}
