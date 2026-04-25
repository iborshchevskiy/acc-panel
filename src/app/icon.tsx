import { ImageResponse } from "next/og";

// Standard PWA icon — 192x192 PNG. Generated at request time so we don't need
// to ship a binary asset. Visually mirrors the sidebar logo: emerald square,
// near-black "₿" glyph, gentle rounded edge.
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#10b981",
          color: "#0d1117",
          fontSize: 132,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          borderRadius: 36,
        }}
      >
        ₿
      </div>
    ),
    { ...size },
  );
}
