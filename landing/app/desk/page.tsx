import type { Metadata } from "next";
import { BootOverlay } from "@/components/boot-overlay";
import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { Marquee } from "@/components/marquee";
import { LiveDesk } from "@/components/live-desk";
import { StatsStrip } from "@/components/stats-strip";
import { PixelDivider } from "@/components/pixel-divider";
import { WhyDifferent } from "@/components/why-different";
import { HowItWorks } from "@/components/how-it-works";
import { Team } from "@/components/team";
import { RiskLab } from "@/components/risk-lab";
import { Guardrails } from "@/components/guardrails";
import { Roadmap } from "@/components/roadmap";
import { Faq } from "@/components/faq";
import { Token } from "@/components/token";
import { CtaFooter } from "@/components/cta-footer";
import { MARQUEE2 } from "@/lib/data";

export const metadata: Metadata = {
  title: "Desk",
  description:
    "The Aelix desk — AI analysts, risk manager, human-approved orders. The pixel control room.",
};

export default function Page() {
  return (
    <>
      <BootOverlay />
      <SiteHeader />
      <main>
        <Hero />
        <Marquee />
        <LiveDesk />
        <StatsStrip />
        <PixelDivider />
        <WhyDifferent />
        <HowItWorks />
        <Team />
        <RiskLab />
        <Guardrails />
        <Roadmap />
        <Faq />
        <Token />
        <Marquee items={MARQUEE2} alt />
      </main>
      <CtaFooter />
    </>
  );
}
