import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WipBanner } from "@/components/site/wip-banner.tsx";
import { bodyFont, displayFont, monoFont } from "@/lib/fonts.ts";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site.ts";
import "./global.css";

interface IRootLayout {
  children: ReactNode;
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: whole .env files on every machine you own`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
};

export default function RootLayout(props: IRootLayout) {
  const { children } = props;

  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider>
          <WipBanner />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
