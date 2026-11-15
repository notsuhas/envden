import { DeferredDemo } from "@/components/landing/ui/motion/deferred-demo.tsx";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { Section } from "@/components/landing/ui/section.tsx";

export function Problem() {
  return (
    <Section
      id="problem"
      chip="Sound familiar?"
      title={
        <>
          A secret changes. <Accent>Every other machine</Accent> is now stale.
        </>
      }
      body="You rotate a key on your laptop, and your remote dev box keeps the old one. A new machine or a fresh worktree starts with nothing. Coding agents work in a dozen worktrees, and each one needs the env. So you paste secrets into chat and hope you got them all."
    >
      <DeferredDemo kind="drift" />
    </Section>
  );
}
