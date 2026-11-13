interface ITripStep {
  command: string;
  active: boolean;
}

export function TripStep(props: ITripStep) {
  const { command, active } = props;

  return (
    <div className="flex items-center justify-center gap-2 xl:flex-col" data-active={active}>
      <code
        className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors duration-300 ${
          active
            ? "border-den-lantern bg-den-lantern text-den-on-lantern"
            : "border-den-line text-den-muted"
        }`}
      >
        {command}
      </code>
      <span className="text-den-muted xl:hidden" aria-hidden="true">
        ↓
      </span>
      <span className="hidden text-den-muted xl:inline" aria-hidden="true">
        →
      </span>
    </div>
  );
}
