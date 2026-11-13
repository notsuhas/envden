import { FeatureRow } from "@/components/landing/how-it-works/feature-row.tsx";
import { AgentFigure } from "@/components/landing/how-it-works/figures/agent.tsx";
import { ShellFigure } from "@/components/landing/how-it-works/figures/shell.tsx";
import { StoreFigure } from "@/components/landing/how-it-works/figures/store.tsx";
import { SyncFigure } from "@/components/landing/how-it-works/figures/sync.tsx";
import { Section } from "@/components/landing/ui/section.tsx";

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      title="How it works"
      lede="One real file per repo, linked into every checkout. You decide when it moves."
    >
      <div className="mt-12">
        <FeatureRow
          title="The store and links"
          body="Each device keeps the real env files in a store in your home folder. Every clone and worktree of a repo gets a symlink to the same file, so they never drift apart. Where symlinks aren't available, envden places a real copy instead."
          figure={<StoreFigure />}
        />
        <FeatureRow
          title="Push and pull, by hand"
          body="Nothing syncs on a timer. A pull never overwrites edits you haven't pushed: it merges key by key, shows you the key names it touched, and turns anything ambiguous into a conflict for you to resolve. Values never appear in status or diff output."
          figure={<SyncFigure />}
        />
        <FeatureRow
          title="The shell notice"
          body="With your consent, one line in your shell rc tells you when the checkout you just entered is out of sync. It reads a cache, never runs git and never writes to your checkouts."
          figure={<ShellFigure />}
        />
        <FeatureRow
          title="The agent skill"
          body="One skill lets a coding agent run setup with flags and read status as JSON. The agent never handles the master password, a pairing code or a checkout approval. envden tells it to ask you."
          figure={<AgentFigure />}
        />
      </div>
    </Section>
  );
}
