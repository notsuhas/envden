import { Footer } from "@/components/landing/chrome/footer.tsx";
import { StatusBar } from "@/components/landing/chrome/status-bar.tsx";
import { Closing } from "@/components/landing/closing.tsx";
import { Features } from "@/components/landing/features.tsx";
import { Problem } from "@/components/landing/problem.tsx";
import { Yours } from "@/components/landing/yours.tsx";
import { Hero } from "@/components/landing/hero.tsx";
import { Install } from "@/components/landing/install.tsx";
import { RoundTrip } from "@/components/landing/round-trip.tsx";
import { Security } from "@/components/landing/security.tsx";
import { MotionRoot } from "@/components/landing/ui/motion/motion-root.tsx";

const NO_SCRIPT_STYLE = "[data-reveal]{opacity:1!important;transform:none!important}";

export default function HomePage() {
  return (
    <MotionRoot>
      <noscript>
        <style>{NO_SCRIPT_STYLE}</style>
      </noscript>
      <div className="den-frame flex-1 pb-9">
        <main>
          <Hero />
          <Problem />
          <RoundTrip />
          <Features />
          <Yours />
          <Security />
          <Install />
          <Closing />
        </main>
        <Footer />
      </div>
      <StatusBar />
    </MotionRoot>
  );
}
