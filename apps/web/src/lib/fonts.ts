import { Bricolage_Grotesque, Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";

export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--ff-display",
});

export const bodyFont = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--ff-body",
});

export const monoFont = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--ff-code",
});
