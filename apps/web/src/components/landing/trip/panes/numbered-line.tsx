import type { ReactNode } from "react";

interface INumberedLine {
  number: number;
  children: ReactNode;
}

export function NumberedLine(props: INumberedLine) {
  const { number, children } = props;

  return (
    <li className="flex gap-2.5 whitespace-pre">
      <span className="w-3 shrink-0 text-right text-[rgba(156,162,176,0.5)] select-none">
        {number}
      </span>
      {children}
    </li>
  );
}
