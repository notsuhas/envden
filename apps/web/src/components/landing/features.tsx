import { FeatureCell } from "@/components/landing/features/cell.tsx";
import { LayoutPreview } from "@/components/landing/features/previews/layout.tsx";
import { MergePreview } from "@/components/landing/features/previews/merge.tsx";
import { PairPreview } from "@/components/landing/features/previews/pair.tsx";
import { RecoveryPreview } from "@/components/landing/features/previews/recovery.tsx";
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
      <div className="den-cells border-t border-den-line sm:grid-cols-2 den-bento lg:grid-cols-6">
        <FeatureCell
          title="One file, every worktree."
          body="Each repo's env lives in one place on your machine, and every approved checkout links to it."
          preview={<StorePreview />}
        />
        <FeatureCell
          title="Merges by key, like Git."
          body="Edit on two machines and envden merges the keys that changed. When both sides change the same key, you get a conflict to resolve."
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
          title="Add a machine with a code."
          body={
            <>
              Run <code className="font-mono text-den-ink">envden device add</code> on a machine
              that's already in, type its one-time code on the new one, and approve.
            </>
          }
          preview={<PairPreview />}
        />
        <FeatureCell
          title="Lost a laptop? Remove it."
          body="envden rotates the keys, so that device can't fetch anything new."
          preview={<RemovePreview />}
        />
        <FeatureCell
          title="Comments and order survive."
          body="envden syncs the whole file, not a list of keys. Comments, key order and blank lines arrive as you wrote them."
          preview={<LayoutPreview />}
        />
        <FeatureCell
          title="Keep a recovery kit."
          body="Print it at setup and store it like a passport. With your master password, it gets a new machine in when you've lost the others."
          preview={<RecoveryPreview />}
        />
      </div>
    </Section>
  );
}
