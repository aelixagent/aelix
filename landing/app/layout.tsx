import type { Metadata, Viewport } from "next";
import { Archivo_Black, Press_Start_2P, Space_Mono, Cormorant_Garamond, Instrument_Sans } from "next/font/google";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import { SITE_URL } from "@/app/docs/_content/site";
import { JsonLd } from "@/app/docs/_components/structured-data";
import "./globals.css";

const display = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press", display: "swap" });
const mono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-space", display: "swap" });
// cinematic homepage type: thin high-contrast serif + clean sans
const serif = Cormorant_Garamond({
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});
const sans = Instrument_Sans({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-sans", display: "swap" });

const TITLE = "AELIX";
const DESC =
  "AELIX — on-chain agentic trading desk. Testnet preview.";

// Favicons come from the file-based metadata convention: app/icon.png + app/apple-icon.png
// (the Aelix "V" mark). The 1200×630 social card comes from app/opengraph-image.tsx —
// both are injected by Next automatically, so no images are listed here.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // "./" resolves per-route against metadataBase → every page gets a
  // self-referencing canonical without per-page boilerplate.
  alternates: { canonical: "./" },
  title: { default: TITLE, template: "%s · AELIX" },
  description: DESC,
  applicationName: "AELIX",
  keywords: ["Aelix", "agentic AI", "trading desk", "on-chain", "RWA vault", "Robinhood Chain", "multi-agent", "human-in-the-loop"],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: { title: TITLE, description: DESC, type: "website", siteName: "AELIX", url: SITE_URL, locale: "en_US" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

/** Sitewide entity graph: who publishes this site + what the site is. */
const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "Aelix",
      url: SITE_URL,
      logo: `${SITE_URL}/aelix-mark.png`,
      sameAs: ["https://github.com/aelixagent/aelix"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "AELIX",
      description: DESC,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ],
};

export const viewport: Viewport = {
  themeColor: "#22242A",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${pixel.variable} ${mono.variable} ${serif.variable} ${sans.variable}`}>
      <body>
        <JsonLd data={ORG_JSONLD} />
        <noscript>
          {/* Progressive enhancement: without JS, reveal content and hide the JS-driven boot overlay. */}
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}.boot{display:none!important}`}</style>
        </noscript>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
