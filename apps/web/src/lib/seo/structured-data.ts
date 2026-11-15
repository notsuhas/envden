import { ENVDEN_VERSION, GITHUB_URL, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site.ts";

export function softwareApplication() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    description: SITE_TAGLINE,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Linux, Windows",
    softwareVersion: ENVDEN_VERSION,
    license: `${GITHUB_URL}/blob/main/LICENSE`,
    codeRepository: GITHUB_URL,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
}

// JSON inside <script> must not contain "</", so every "<" is escaped.
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
