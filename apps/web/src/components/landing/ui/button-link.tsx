import Link from "next/link";
import type { ReactNode } from "react";

interface IButtonLink {
  href: string;
  children: ReactNode;
  variant?: "primary" | "quiet";
}

const VARIANT_CLASS = {
  primary: "bg-den-lantern text-den-on-lantern hover:opacity-90",
  quiet: "border border-den-line text-den-ink hover:bg-den-surface",
};

export function ButtonLink(props: IButtonLink) {
  const { href, children, variant = "primary" } = props;

  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${VARIANT_CLASS[variant]}`}
    >
      {children}
    </Link>
  );
}
