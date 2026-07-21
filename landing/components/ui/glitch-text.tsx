import { cn } from "@/lib/cn";

/**
 * GlitchText — RGB-split pixel glitch (red/mint ghost slices) on a piece of
 * text. Pure CSS (see .glitch in globals.css), server-component safe.
 *
 *   <GlitchText text="AELIX" />                 → glitches on hover
 *   <GlitchText text="AELIX" mode="always" />   → periodic ambient bursts
 *
 * Wrap it in the original element: <h2><GlitchText text="..." /></h2>.
 */
export function GlitchText({
  text,
  mode = "hover",
  className,
}: {
  text: string;
  mode?: "hover" | "always";
  className?: string;
}) {
  return (
    <span className={cn("glitch", mode === "always" && "glitch-always", className)} data-text={text}>
      {text}
    </span>
  );
}
