export interface ITerminalLine {
  kind: "command" | "output";
  text: string;
  note?: string;
}

interface ITerminal {
  lines: ITerminalLine[];
  caption?: string;
}

export function Terminal(props: ITerminal) {
  const { lines, caption } = props;

  return (
    <figure className="rounded-xl border border-den-line bg-den-surface">
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-7 text-den-ink">
        {lines.map((line) => (
          <span key={line.text} className="block">
            {line.kind === "command" ? (
              <span className="select-none text-den-muted">$ </span>
            ) : null}
            <span className={line.kind === "output" ? "text-den-lantern" : undefined}>
              {line.text}
            </span>
            {line.note ? <span className="text-den-muted">{`  # ${line.note}`}</span> : null}
          </span>
        ))}
      </pre>
      {caption ? (
        <figcaption className="border-t border-den-line px-5 py-3 text-xs text-den-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
