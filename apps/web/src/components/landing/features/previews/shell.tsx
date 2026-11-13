import { InView } from "@/components/landing/ui/motion/in-view.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";

export function ShellPreview() {
  return (
    <Window title="zsh">
      <InView className="group p-3 font-mono text-[11.5px] leading-6">
        <p className="text-den-ink">
          <span className="text-den-muted select-none">$ </span>
          <span className="den-typed inline-block align-bottom">cd ~/code/shop</span>
        </p>
        <p className="break-all text-den-lantern opacity-0 transition-opacity delay-[1300ms] duration-300 ease-out group-data-[seen=true]:opacity-100">
          envden: github.com/you/shop out of sync
        </p>
      </InView>
    </Window>
  );
}
