import { ImageResponse } from "next/og";

// iOS home-screen icon — 180x180 PNG. iOS always renders into a rounded
// square mask, so we draw a solid emerald background (no transparency)
// and let iOS apply the corner radius. The sidebar's "₿" glyph is the
// recognisable mark across the app.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 124,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        ₿
      </div>
    ),
    { ...size },
  );
}
