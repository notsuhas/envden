import { DeferredDemo } from "@/components/landing/ui/motion/deferred-demo.tsx";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { Section } from "@/components/landing/ui/section.tsx";

export function RoundTrip() {
  return (
    <Section
      id="how"
      title={
        <>
          Push here, pull there. <Accent>Encrypted</Accent> in between.
        </>
      }
      body="It works like Git: push from one machine, pull on another. The file is encrypted before it leaves, so your server stores bytes it can't read."
    >
      <DeferredDemo kind="trip" />
    </Section>
  );
}
