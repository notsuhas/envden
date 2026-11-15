import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AlphaBanner } from "@/components/site/alpha-banner.tsx";
import { ConsentBanner } from "@/components/site/consent-banner.tsx";
import { bodyFont, displayFont, monoFont } from "@/lib/fonts.ts";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site.ts";
import "./global.css";

interface IRootLayout {
  children: ReactNode;
}

const HOME_TITLE = `${SITE_NAME}: self-hosted Git for your .env files`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  openGraph: {
    siteName: SITE_NAME,
    title: HOME_TITLE,
    description: SITE_TAGLINE,
    type: "website",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: SITE_TAGLINE,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "rgba(12, 12, 11, 1)",
};

export default function RootLayout(props: IRootLayout) {
  const { children } = props;

  return (
    <html
      lang="en"
      className={`dark ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider theme={{ enabled: false }}>
          <AlphaBanner />
          {children}
          <ConsentBanner />
        </RootProvider>
      </body>
    </html>
  );
}
