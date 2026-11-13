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
          Every laptop has a <Accent>slightly different</Accent> .env.
        </>
      }
      body="You fix a key on one machine and forget the other. A new worktree starts with no env at all. You end up sending yourself secrets over chat. Secrets managers help, but they store keys, not files, so your comments and layout don't make it."
    >
      <DeferredDemo kind="drift" />
    </Section>
  );
}
