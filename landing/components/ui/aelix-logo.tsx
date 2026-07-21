/** The Aelix mark — the white "AX" monogram glyph (transparent). Used for every
 *  on-site logo (header, footer, docs). The favicon is a separate chartreuse
 *  tile at app/icon.png. */
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
        objectFit: "contain",
        filter: "drop-shadow(0 0 10px rgba(215, 254, 81, 0.25))",
      }}
    />
  );
}
