/** Hand-placed pixel SVGs. All server-renderable (no state). */
import { INK, LIME, RED, GREEN, GREEN_DEEP, WHITE } from "@/lib/brand";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" fill={INK} />
      <rect x="6" y="20" width="4" height="6" fill={LIME} />
      <rect x="12" y="14" width="4" height="12" fill={LIME} />
      <rect x="18" y="10" width="4" height="16" fill={RED} />
      <rect x="24" y="6" width="4" height="20" fill={LIME} />
    </svg>
  );
}

export function PixelHill({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 220" width="100%" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <path d="M0 220 L120 120 L200 96 L300 88 L400 104 L480 140 L560 200 L560 220 Z" fill="#D7FE51" />
      <path d="M0 220 L120 132 L200 108 L300 100 L400 116 L480 152 L560 210 L560 220 Z" fill="#8FAE2E" />
      <rect x="150" y="150" width="6" height="14" fill="#8FAE2E" />
      <rect x="340" y="132" width="6" height="14" fill="#8FAE2E" />
      <rect x="430" y="150" width="6" height="14" fill="#8FAE2E" />
    </svg>
  );
}

export function PixelBot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 128" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="52" y="0" width="16" height="8" fill={RED} />
      <rect x="56" y="8" width="8" height="16" fill={INK} />
      <rect x="16" y="24" width="88" height="72" fill={INK} />
      <rect x="24" y="32" width="72" height="48" fill="#22242A" />
      <rect x="36" y="48" width="12" height="16" fill={RED} />
      <rect x="36" y="48" width="4" height="4" fill={WHITE} />
      <rect x="72" y="48" width="12" height="16" fill={RED} />
      <rect x="72" y="48" width="4" height="4" fill={WHITE} />
      <rect x="40" y="70" width="6" height="4" fill={LIME} />
      <rect x="50" y="70" width="6" height="4" fill={LIME} />
      <rect x="60" y="70" width="6" height="4" fill={LIME} />
      <rect x="70" y="70" width="6" height="4" fill={LIME} />
      <rect x="40" y="96" width="40" height="8" fill={INK} />
      <rect x="28" y="104" width="64" height="8" fill={INK} />
    </svg>
  );
}

export function CheckPixel() {
  return (
    <svg className="ci" viewBox="0 0 18 18" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="9" width="3" height="3" fill={GREEN_DEEP} />
      <rect x="6" y="12" width="3" height="3" fill={GREEN_DEEP} />
      <rect x="9" y="9" width="3" height="3" fill={GREEN_DEEP} />
      <rect x="12" y="6" width="3" height="3" fill={GREEN_DEEP} />
      <rect x="15" y="3" width="3" height="3" fill={GREEN_DEEP} />
    </svg>
  );
}

export function CrossPixel() {
  return (
    <svg className="ci" viewBox="0 0 18 18" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="3" width="3" height="3" fill={RED} />
      <rect x="15" y="3" width="3" height="3" fill={RED} />
      <rect x="6" y="6" width="3" height="3" fill={RED} />
      <rect x="12" y="6" width="3" height="3" fill={RED} />
      <rect x="9" y="9" width="3" height="3" fill={RED} />
      <rect x="6" y="12" width="3" height="3" fill={RED} />
      <rect x="12" y="12" width="3" height="3" fill={RED} />
      <rect x="3" y="15" width="3" height="3" fill={RED} />
      <rect x="15" y="15" width="3" height="3" fill={RED} />
    </svg>
  );
}

export function TeamIcon({ kind }: { kind: string }) {
  const common = { className: "ic", viewBox: "0 0 48 48", shapeRendering: "crispEdges" as const, "aria-hidden": true };
  if (kind === "fundamental")
    return (
      <svg {...common}>
        <rect x="6" y="30" width="8" height="12" fill={INK} />
        <rect x="20" y="20" width="8" height="22" fill={INK} />
        <rect x="34" y="10" width="8" height="32" fill={GREEN} />
      </svg>
    );
  if (kind === "technical")
    return (
      <svg {...common}>
        <rect x="10" y="8" width="4" height="34" fill={INK} />
        <rect x="10" y="38" width="34" height="4" fill={INK} />
        <rect x="4" y="28" width="6" height="6" fill={INK} />
        <rect x="16" y="20" width="6" height="6" fill={INK} />
        <rect x="26" y="24" width="6" height="6" fill={RED} />
        <rect x="36" y="12" width="6" height="6" fill={GREEN} />
      </svg>
    );
  if (kind === "macro")
    return (
      <svg {...common}>
        <rect x="8" y="8" width="32" height="26" fill={INK} />
        <rect x="12" y="14" width="24" height="4" fill={LIME} />
        <rect x="12" y="22" width="16" height="4" fill={LIME} />
        <rect x="18" y="34" width="12" height="8" fill={INK} />
        <rect x="30" y="4" width="10" height="10" fill={RED} />
      </svg>
    );
  // risk
  return (
    <svg {...common}>
      <rect x="10" y="6" width="28" height="8" fill={INK} />
      <rect x="10" y="6" width="8" height="34" fill={INK} />
      <rect x="30" y="6" width="8" height="34" fill={INK} />
      <rect x="18" y="34" width="12" height="6" fill={INK} />
      <rect x="20" y="20" width="8" height="8" fill={RED} />
    </svg>
  );
}
