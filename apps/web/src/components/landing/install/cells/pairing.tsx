import { APPROVER_SESSION, JOINER_SESSION } from "@/components/landing/install/sessions.ts";
import { TypedSession } from "@/components/landing/ui/typed/session.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";

export function PairingCell() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Window title="laptop">
        <TypedSession lines={APPROVER_SESSION} className="min-h-40 p-3" />
      </Window>
      <Window title="desktop">
        <TypedSession lines={JOINER_SESSION} className="min-h-40 p-3" />
      </Window>
    </div>
  );
}
