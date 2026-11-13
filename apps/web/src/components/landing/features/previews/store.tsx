import { FlowLine } from "@/components/landing/features/flow/line.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";

const CHECKOUTS = ["~/code/shop/.env", "~/code/shop-fix/.env"];

export function StorePreview() {
  return (
    <Window title="~/.envden/store">
      <div className="grid gap-2 p-3 font-mono text-[11.5px]">
        {CHECKOUTS.map((checkout, index) => (
          <div key={checkout} className="flex items-center gap-2">
            <span className="min-w-0 shrink truncate text-den-muted">{checkout}</span>
            <FlowLine tone="lantern" delayMs={index * 700} className="min-w-6 flex-1" />
          </div>
        ))}
        <p className="border border-den-lantern px-2 py-1.5 break-all text-den-ink">
          github.com/you/shop/.env
        </p>
      </div>
    </Window>
  );
}
