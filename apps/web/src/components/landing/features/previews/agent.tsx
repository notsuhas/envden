import { Window } from "@/components/landing/ui/window/window.tsx";

const LINES = ["envden agent install", "envden status --json", "envden doctor --json"];

export function AgentPreview() {
  return (
    <Window title="agent">
      <pre className="overflow-x-auto p-3 font-mono text-[11.5px] leading-6 text-den-ink">
        {LINES.map((line) => (
          <span key={line} className="block">
            <span className="text-den-muted select-none">$ </span>
            {line}
          </span>
        ))}
      </pre>
    </Window>
  );
}
