import { Window } from "@/components/landing/ui/window/window.tsx";

const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7];

export function PairPreview() {
  return (
    <div className="grid grid-cols-2 gap-3 font-mono text-[11.5px]">
      <Window title="laptop">
        <p className="p-3 text-den-muted">
          pairing code
          <span className="mt-1 block text-sm text-den-lantern">3-K7QF-2MXP</span>
        </p>
      </Window>
      <Window title="new laptop">
        <p className="p-3 text-den-muted">
          pairing code
          <span className="mt-1 flex items-center gap-0.5 text-sm text-den-ink" aria-hidden="true">
            {SLOTS.map((slot) => (
              <span
                key={slot}
                className="den-slot h-4 w-2 bg-den-ink"
                style={{ animationDelay: `${slot * 220}ms` }}
              />
            ))}
          </span>
          <span className="sr-only">typed on the new machine</span>
        </p>
      </Window>
    </div>
  );
}
