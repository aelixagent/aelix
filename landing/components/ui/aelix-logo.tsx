/** The Aelix mark — the chartreuse AX monogram tile. One asset drives every
 *  logo across the site (and the favicon at app/icon.png), so the brand mark
 *  stays identical everywhere. */
export function AelixLogo({ size = 34, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/aelix-mark.png"
      alt="Aelix"
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        flex: "none",
        display: "block",
        borderRadius: Math.max(6, Math.round(size * 0.24)),
        objectFit: "cover",
        boxShadow: "0 0 18px rgba(215, 254, 81, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
      }}
    />
  );
}
