import { Footer } from "@/components/landing/footer.tsx";
import { Hero } from "@/components/landing/hero.tsx";
import { HowItWorks } from "@/components/landing/how-it-works.tsx";
import { Install } from "@/components/landing/install.tsx";
import { MotionRoot } from "@/components/landing/ui/motion-root.tsx";
import { Security } from "@/components/landing/security.tsx";

const NO_SCRIPT_STYLE = "[data-reveal]{opacity:1!important;transform:none!important}";

export default function HomePage() {
  return (
    <MotionRoot>
      <noscript>
        <style>{NO_SCRIPT_STYLE}</style>
      </noscript>
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Install />
        <Security />
      </main>
      <Footer />
    </MotionRoot>
  );
}
