import type { TTripPhase } from "@/components/landing/trip/state/phases.ts";

export const TRIP_STEPS: { phase: TTripPhase; label: string; caption: string }[] = [
  {
    phase: "written",
    label: "Write",
    caption: "The .env on your laptop, as you wrote it. Comments and blank lines are part of it.",
  },
  {
    phase: "sealed",
    label: "Seal",
    caption: "envden push encrypts the file on the laptop with its own key.",
  },
  {
    phase: "stored",
    label: "Store",
    caption:
      "The server stores the ciphertext under an opaque ID. It can't read the contents, the file name or the repo.",
  },
  {
    phase: "pulled",
    label: "Pull",
    caption:
      "envden pull downloads the ciphertext and checks it against a manifest that one of your devices signed.",
  },
  {
    phase: "opened",
    label: "Open",
    caption: "The desktop decrypts it. Both machines now have the same bytes.",
  },
];
