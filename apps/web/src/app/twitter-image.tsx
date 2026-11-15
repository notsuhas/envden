import { SOCIAL_CARD_ALT, SOCIAL_CARD_SIZE, renderSocialCard } from "@/lib/seo/social-card.tsx";

export const alt = SOCIAL_CARD_ALT;

export const size = SOCIAL_CARD_SIZE;

export const contentType = "image/png";

export default function Image() {
  return renderSocialCard();
}
