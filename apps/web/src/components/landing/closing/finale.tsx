import type { ISessionLine } from "@/components/landing/ui/typed/frame.ts";

const SESSION: ISessionLine[] = [
  { kind: "command", text: "envden setup" },
  { kind: "prompt", text: "Device name" },
  { kind: "answer", text: "laptop" },
  { kind: "output", text: "✓ vault created" },
  { kind: "output", text: "Recovery code: ER1-7KQ2M-X9D4F-…" },
  { kind: "output", text: "Store this in your password manager." },
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
