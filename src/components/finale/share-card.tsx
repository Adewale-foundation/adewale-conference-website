import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

export const supportersLabel = (n: number) => `${n.toLocaleString("en-NG")} ${n === 1 ? "supporter" : "supporters"}`;

const NAVY = "#0A0F1E";
const GOLD = "#E8A020";
const CREAM = "#F0EAD8";

// Satori only draws weights it is given, and next/og ships just a regular face.
async function fonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [bold, medium] = await Promise.all([
    readFile(join(dir, "Inter-ExtraBold.ttf")),
    readFile(join(dir, "Inter-Medium.ttf")),
  ]);
  return [
    { name: "Inter", data: bold, weight: 800 as const, style: "normal" as const },
    { name: "Inter", data: medium, weight: 500 as const, style: "normal" as const },
  ];
}

/** The WhatsApp/social preview for the fan vote: the poster's navy and gold,
 *  with a team's colour as the accent when the link is to a team. */
export async function shareCard({
  eyebrow,
  kicker,
  headline,
  accent = GOLD,
  footer,
  stat,
}: {
  eyebrow: string;
  kicker?: string;
  headline: string;
  accent?: string;
  footer: string;
  stat?: string;
}) {
  const headlineSize = headline.length > 34 ? 60 : headline.length > 22 ? 76 : 96;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NAVY,
          color: CREAM,
          fontFamily: "Inter",
          padding: "64px 72px",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 12, background: accent, display: "flex" }} />
        <svg width="560" height="560" viewBox="0 0 24 24" style={{ position: "absolute", right: -60, top: -40 }}>
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill="rgba(232,160,32,0.08)"
          />
        </svg>

        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              border: `2px solid ${GOLD}`,
              background: "rgba(232,160,32,0.08)",
              color: GOLD,
              padding: "12px 22px",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: 5,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
          {kicker ? (
            <div style={{ display: "flex", fontSize: 34, fontWeight: 500, color: "rgba(240,234,216,0.75)", marginBottom: 12 }}>
              {kicker}
            </div>
          ) : null}
          <div style={{ display: "flex", fontSize: headlineSize, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, color: "#FFFFFF" }}>
            {headline}
          </div>
          <div style={{ display: "flex", width: 120, height: 8, background: accent, marginTop: 28, borderRadius: 4 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: "rgba(240,234,216,0.8)" }}>{footer}</div>
          {stat ? (
            <div
              style={{
                display: "flex",
                background: GOLD,
                color: NAVY,
                padding: "14px 26px",
                borderRadius: 999,
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              {stat}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...SHARE_CARD_SIZE, fonts: await fonts() },
  );
}
