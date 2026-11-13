import { DeferredDemo } from "@/components/landing/ui/motion/deferred-demo.tsx";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { Section } from "@/components/landing/ui/section.tsx";

export function RoundTrip() {
  return (
    <Section
      id="how"
      title={
        <>
          <Accent>Encrypted</Accent> before it leaves your machine.
        </>
      }
      body="Push from one computer, pull on another. Your server stores the file but can't read it."
    >
      <DeferredDemo kind="trip" />
    </Section>
  );
}
