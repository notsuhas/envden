interface IFlowLine {
  tone: "lantern" | "cipher";
  delayMs?: number;
  className?: string;
}

const DOT_CLASS = { lantern: "bg-den-lantern", cipher: "bg-den-cipher" };

export function FlowLine(props: IFlowLine) {
  const { tone, delayMs = 0, className = "" } = props;

  return (
    <span className={`relative block h-2 overflow-hidden ${className}`} aria-hidden="true">
      <span className="absolute inset-x-0 top-1/2 h-px bg-den-line-strong" />
      <span className="den-flow absolute inset-0" style={{ animationDelay: `${delayMs}ms` }}>
        <span
          className={`absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 ${DOT_CLASS[tone]}`}
        />
      </span>
    </span>
  );
}
