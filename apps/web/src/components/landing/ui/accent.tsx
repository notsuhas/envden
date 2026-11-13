import type { ReactNode } from "react";

interface IAccent {
  children: ReactNode;
}

export function Accent(props: IAccent) {
  const { children } = props;

  return <span className="font-medium text-den-lantern">{children}</span>;
}
