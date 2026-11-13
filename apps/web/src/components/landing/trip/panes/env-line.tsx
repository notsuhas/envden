interface IEnvLine {
  text: string;
}

export function EnvLine(props: IEnvLine) {
  const { text } = props;
  const separator = text.indexOf("=");

  if (text.startsWith("#") || separator === -1) {
    return <span className="text-den-muted">{text === "" ? " " : text}</span>;
  }

  return (
    <span>
      <span className="text-den-ink">{text.slice(0, separator)}</span>
      <span className="text-den-muted">=</span>
      <span className="text-den-lantern">{text.slice(separator + 1)}</span>
    </span>
  );
}
