import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const ogSize = { width: 1200, height: 630 };

/** Branded 1200×630 social card used by every route's opengraph-image. */
export function renderOgImage({
  eyebrow,
  title,
  subtitle,
  accent = "#8b8dfb",
  chips,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  accent?: string;
  chips: string[];
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0b0d14",
          color: "#e9ebf3",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 36, fontWeight: 700 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#1b1f3b",
              display: "flex",
              flexWrap: "wrap",
              padding: 12,
              gap: 6,
            }}
          >
            <div style={{ width: 17, height: 17, borderRadius: 4, background: "#fff" }} />
            <div style={{ width: 17, height: 17, borderRadius: 4, background: "#ffffff8c" }} />
            <div style={{ width: 17, height: 17, borderRadius: 4, background: "#ffffff8c" }} />
            <div style={{ width: 17, height: 17, borderRadius: 4, background: accent }} />
          </div>
          {siteConfig.name}
          {eyebrow && (
            <div
              style={{
                display: "flex",
                marginLeft: 12,
                padding: "6px 18px",
                borderRadius: 999,
                fontSize: 24,
                color: accent,
                border: `2px solid ${accent}`,
              }}
            >
              {eyebrow}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, maxWidth: 1050 }}>{title}</div>
          <div style={{ fontSize: 30, color: "#9aa0b4", maxWidth: 1000 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 24 }}>
          {chips.map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                border: "2px solid #242939",
                background: "#12151f",
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    ogSize,
  );
}
