import type { ISessionLine } from "@/components/landing/ui/typed/frame.ts";

const SESSION: ISessionLine[] = [
  { kind: "command", text: "envden setup" },
  { kind: "prompt", text: "Device name" },
  { kind: "answer", text: "laptop" },
  { kind: "prompt", text: "Master password" },
  { kind: "answer", text: "••••••••••••" },
  { kind: "output", text: "✓ vault created" },
  { kind: "output", text: "Store this recovery kit like a passport." },
];

import { TypedSession } from "@/components/landing/ui/typed/session.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";

export function Finale() {
  return (
    <Window title="envden setup" className="w-full max-w-none justify-self-end">
      <TypedSession lines={SESSION} className="min-h-[11rem] p-4" />
    </Window>
  );
}
