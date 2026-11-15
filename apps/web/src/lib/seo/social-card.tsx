import { ImageResponse } from "next/og";
import { ENVDEN_VERSION, SITE_NAME } from "@/lib/site.ts";

export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 };

export const SOCIAL_CARD_ALT = `${SITE_NAME}: change a secret once, every machine has it`;

const INK = "rgba(237, 233, 224, 1)";
const MUTED = "rgba(160, 157, 148, 1)";
const LINE = "rgba(237, 233, 224, 0.16)";
const LANTERN = "rgba(247, 190, 84, 1)";

interface IPageCard {
  title: string;
  description?: string | undefined;
}

export function renderSocialCard(page?: IPageCard): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: "0 56px",
        background: "rgba(12, 12, 11, 1)",
        color: INK,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          padding: "64px 56px",
          borderLeft: `1px solid ${LINE}`,
          borderRight: `1px solid ${LINE}`,
        }}
      >
        <div style={{ display: "flex", fontSize: 36 }}>
          <span style={{ color: LANTERN }}>.</span>
          {SITE_NAME}
        </div>
        {page ? pageHeadline(page) : homeHeadline()}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: 28,
            borderTop: `1px solid ${LINE}`,
            fontSize: 24,
            color: MUTED,
          }}
        >
          <span>github.com/notsuhas/envden</span>
          <span>{`v${ENVDEN_VERSION} alpha`}</span>
        </div>
      </div>
    </div>,
    SOCIAL_CARD_SIZE,
  );
}

function homeHeadline() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 84,
          lineHeight: 1.05,
          letterSpacing: -3,
        }}
      >
        <span>Change a secret once.</span>
        <div style={{ display: "flex" }}>
          <span style={{ color: LANTERN }}>Every machine</span>
          <span>&nbsp;has it.</span>
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 36, fontSize: 30, color: MUTED }}>
        Self-hosted Git for your .env files · end-to-end encrypted
      </div>
    </div>
  );
}

function pageHeadline(page: IPageCard) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 26, color: LANTERN }}>Docs</div>
      <div
        style={{
          display: "flex",
          marginTop: 16,
          fontSize: 72,
          lineHeight: 1.05,
          letterSpacing: -2,
        }}
      >
        {page.title}
      </div>
      {page.description ? (
        <div style={{ display: "flex", marginTop: 28, fontSize: 30, color: MUTED }}>
          {page.description}
        </div>
      ) : null}
    </div>
  );
}
