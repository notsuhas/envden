import { ButtonLink } from "@/components/landing/ui/button-link.tsx";
import { PointList } from "@/components/landing/security/point-list.tsx";
import { Reveal } from "@/components/landing/ui/reveal.tsx";
import { Section } from "@/components/landing/ui/section.tsx";
import { LIMITS, PROTECTS } from "@/components/landing/security/points.ts";
import { DOCS_ROUTE } from "@/lib/routes.ts";

export function Security() {
  return (
    <Section
      id="security"
      title="Security, with the limits"
      lede="Files are encrypted on your devices before they leave. Here is what that covers, and what it doesn't."
    >
      <Reveal className="mt-12 grid gap-12 border-t border-den-line pt-10 md:grid-cols-2">
        <PointList title="What envden protects" points={PROTECTS} tone="protects" />
        <PointList title="What it doesn't" points={LIMITS} tone="limits" />
      </Reveal>
      <div className="mt-10">
        <ButtonLink href={`${DOCS_ROUTE}/security`} variant="quiet">
          Read the threat model
        </ButtonLink>
      </div>
    </Section>
  );
}
