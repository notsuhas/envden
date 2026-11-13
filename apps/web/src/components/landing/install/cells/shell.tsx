import type { ReactNode } from "react";

interface IInstallCell {
  chip: string;
  children: ReactNode;
}

export function InstallCell(props: IInstallCell) {
  const { chip, children } = props;

  return (
    <div className="den-corners relative flex min-h-56 flex-col gap-4 p-4 sm:p-6">
      <p className="den-chip self-start">
        <span className="h-1.5 w-1.5 bg-den-lantern" aria-hidden="true" />
        {chip}
      </p>
      {children}
    </div>
  );
}
