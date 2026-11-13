import { TypedSession } from "@/components/landing/ui/typed/session.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";
import type { ISessionLine } from "@/components/landing/ui/typed/frame.ts";

const SESSION: ISessionLine[] = [
  { kind: "command", text: "envden agent install" },
  { kind: "command", text: "envden status --json" },
  { kind: "command", text: "envden doctor --json" },
];

export function AgentPreview() {
  return (
    <Window title="agent">
      <TypedSession lines={SESSION} className="p-3" />
    </Window>
  );
}
