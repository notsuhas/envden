import { FeatureCell } from "@/components/landing/features/cell.tsx";
import { AgentPreview } from "@/components/landing/features/previews/agent.tsx";
import { MergePreview } from "@/components/landing/features/previews/merge.tsx";
import { PairPreview } from "@/components/landing/features/previews/pair.tsx";
import { RemovePreview } from "@/components/landing/features/previews/remove.tsx";
import { ShellPreview } from "@/components/landing/features/previews/shell.tsx";
import { StorePreview } from "@/components/landing/features/previews/store.tsx";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { Section } from "@/components/landing/ui/section.tsx";

export function Features() {
  return (
    <Section
      id="features"
      title={
        <>
          Everything a <Accent>.env</Accent> needs to follow you around.
        </>
      }
    >
      <div className="den-cells border-t border-den-line sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCell
          title="One file, every worktree."
          body="Each repo's env lives in one place, and every checkout links to it."
          preview={<StorePreview />}
        />
        <FeatureCell
          title="Merges by key."
          body="Edit on two machines and envden merges the keys that changed. Real conflicts wait for you."
          preview={<MergePreview />}
        />
        <FeatureCell
          title="A nudge in your shell."
          body={
            <>
              <code className="font-mono text-den-ink">cd</code> into a repo that's behind and your
              prompt tells you.
            </>
          }
          preview={<ShellPreview />}
        />
        <FeatureCell
          title="Add a laptop with a code."
          body="Type an 8-character pairing code on the new machine and it's in."
          preview={<PairPreview />}
        />
        <FeatureCell
          title="Lost a laptop? Remove it."
          body="envden rotates the keys, so that device can't fetch anything new."
          preview={<RemovePreview />}
        />
        <FeatureCell
          title="Built for coding agents."
          body="Agents can check status and run setup. You still type the password."
          preview={<AgentPreview />}
        />
      </div>
    </Section>
  );
}
