import { ImageResponse } from "next/og";

/**
 * Locally-generated 512×512 Home Screen icon — same deep-green SCAR
 * badge treatment as icon-192, scaled up for higher-resolution Home
 * Screen / splash usage.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#022c22",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            color: "#ecfdf5",
            fontSize: 170,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          SCAR
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
