import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexWrap: "wrap",
          alignContent: "center",
          justifyContent: "center",
          gap: 12,
          padding: 34,
          background: "#1b1f3b",
        }}
      >
        <div style={{ width: 50, height: 50, borderRadius: 12, background: "#ffffff" }} />
        <div style={{ width: 50, height: 50, borderRadius: 12, background: "#ffffff8c" }} />
        <div style={{ width: 50, height: 50, borderRadius: 12, background: "#ffffff8c" }} />
        <div style={{ width: 50, height: 50, borderRadius: 12, background: "#8b8dfb" }} />
      </div>
    ),
    size,
  );
}
