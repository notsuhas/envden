import { Bricolage_Grotesque, Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";

export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  adjustFontFallback: true,
  variable: "--ff-display",
  axes: ["wdth"],
});

export const bodyFont = Schibsted_Grotesk({
  subsets: ["latin"],
  adjustFontFallback: true,
  variable: "--ff-body",
});

export const monoFont = Spline_Sans_Mono({
  subsets: ["latin"],
  adjustFontFallback: true,
  variable: "--ff-code",
});
