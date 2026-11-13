import { InView } from "@/components/landing/ui/motion/in-view.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";

const SIDES = [
  { name: "laptop", rows: ["API_KEY", "DB_URL", "~ PORT"], result: false },
  { name: "desktop", rows: ["API_KEY", "DB_URL", "PORT", "+ REDIS_URL"], result: false },
  { name: "merged", rows: ["API_KEY", "DB_URL", "~ PORT", "+ REDIS_URL"], result: true },
];

function rowClass(row: string): string {
  if (row.startsWith("~")) return "text-den-lantern";

  return row.startsWith("+") ? "text-den-cipher" : "text-den-muted";
}

export function MergePreview() {
  return (
    <Window title="envden pull">
      <InView className="group grid grid-cols-3 font-mono text-[11.5px]">
        {SIDES.map((side) => (
          <div key={side.name} className="border-l border-den-line px-2.5 py-2 first:border-l-0">
            <p className="text-den-ink">{side.name}</p>
            <ul
              className={`mt-1 leading-5 ${side.result ? "opacity-0 transition-opacity delay-300 duration-500 ease-out group-data-[seen=true]:opacity-100" : ""}`}
            >
              {side.rows.map((row) => (
                <li key={row} className={`truncate ${rowClass(row)}`}>
                  {row}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </InView>
    </Window>
  );
}
