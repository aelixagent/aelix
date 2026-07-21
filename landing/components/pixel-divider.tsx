/** Decorative pixel strip between sections. */
export function PixelDivider({ onDark = false }: { onDark?: boolean }) {
  return <div className={"divider" + (onDark ? " on-dark" : "")} aria-hidden="true" />;
}
