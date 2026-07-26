import { ImageResponse } from "next/og";

/**
 * 1200×630 social card (og:image / twitter:image) rendered at build time via
 * the file-based metadata convention — replaces the 256px logo, which is too
 * small for a summary_large_image card. Colors mirror lib/brand.ts.
 */
export const alt = "AELIX — least-privilege AI trading";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          backgroundColor: "#22242A",
          color: "#ECF2F0",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 12, color: "#D7FE51" }}>
          LEAST-PRIVILEGE AI TRADING
        </div>
        <div style={{ display: "flex", fontSize: 172, fontWeight: 800, letterSpacing: -6, marginTop: 8 }}>
          AELIX
        </div>
        <div style={{ display: "flex", fontSize: 32, marginTop: 20, color: "#9AA3A0" }}>
          You approve every brokerage order · on-chain, a scoped, revocable, expiring key
        </div>
        <div style={{ display: "flex", fontSize: 24, marginTop: 12, color: "#7E8683" }}>
          Mainnet · unaudited · deposits capped · no track record
        </div>
        <div
          style={{
            position: "absolute",
            left: 96,
            bottom: 64,
            display: "flex",
            fontSize: 26,
            color: "#D7FE51",
          }}
        >
          www.aelix.xyz
        </div>
      </div>
    ),
    size
  );
}
