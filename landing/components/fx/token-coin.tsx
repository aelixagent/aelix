"use client";

import dynamic from "next/dynamic";

/**
 * TokenCoin — client-only wrapper for the spinning voxel $VLR coin.
 * The Three.js scene must be loaded with ssr:false, which requires a
 * client component boundary (token.tsx is a server component).
 * PixelCoin renders its own `.pixel-coin` sized wrapper.
 */
const PixelCoin = dynamic(
  () => import("@/components/three/pixel-coin").then((m) => m.PixelCoin),
  { ssr: false }
);

export function TokenCoin() {
  return <PixelCoin />;
}
