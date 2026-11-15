import { ENV_LINES } from "@/components/landing/content/env-lines.ts";
import { NumberedLine } from "@/components/landing/trip/panes/numbered-line.tsx";
import { EnvLine } from "@/components/landing/ui/env-line.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";

export function LayoutPreview() {
  return (
    <Window
      title="~/work/shop/.env"
      badge={
        <span className="border border-den-lantern px-1 font-mono text-[10px] leading-4 whitespace-nowrap text-den-lantern">
          byte for byte
        </span>
      }
    >
      <ol className="overflow-hidden p-3 font-mono text-[11.5px] leading-5">
        {ENV_LINES.map((line, index) => (
          <NumberedLine key={line || `blank-${index}`} number={index + 1}>
            <EnvLine text={line} />
          </NumberedLine>
        ))}
      </ol>
    </Window>
  );
}
