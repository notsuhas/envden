import type { ISessionLine } from "@/components/landing/ui/typed/frame.ts";

const SESSION: ISessionLine[] = [
  { kind: "command", text: "envden setup" },
  { kind: "output", text: "✓ vault created" },
];

import { TypedSession } from "@/components/landing/ui/typed/session.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";

export function Finale() {
  return (
    <Window title="envden setup" className="w-full max-w-md">
      <TypedSession lines={SESSION} className="min-h-[15.5rem] p-4" />
    </Window>
  );
}
