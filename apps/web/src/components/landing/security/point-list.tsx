interface IPointList {
  title: string;
  points: string[];
  tone: "protects" | "limits";
}

const MARKER_CLASS = {
  protects: "bg-den-lantern",
  limits: "bg-den-cipher",
};

export function PointList(props: IPointList) {
  const { title, points, tone } = props;

  return (
    <div>
      <h3 className="font-display text-xl font-semibold text-den-ink">{title}</h3>
      <ul className="mt-5 space-y-4">
        {points.map((point) => (
          <li key={point} className="flex gap-3 text-den-muted">
            <span
              className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${MARKER_CLASS[tone]}`}
              aria-hidden="true"
            />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
