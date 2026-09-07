import { ImageResponse } from "next/og";

/**
 * Locally-generated 192×192 Home Screen icon — deep-green SCAR badge
 * with the existing "SCAR" text treatment (matches AppHeader's
 * bg-emerald-950 header). No external image service, no new packages;
 * uses Next's built-in ImageResponse.
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
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          SCAR
        </div>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
