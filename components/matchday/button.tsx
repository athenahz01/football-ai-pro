import type { ButtonHTMLAttributes } from "react";

// MATCHDAY button. Primary is Volt and is the only place glow is allowed (the CTA).
// Secondary, ghost, and icon stay neutral. Sizes sm 32, md 40, lg 48.

type Variant = "primary" | "secondary" | "ghost" | "icon";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  glow = false,
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  glow?: boolean;
}) {
  const classes = [
    "md-btn",
    `md-btn--${variant}`,
    `md-btn--${size}`,
    glow ? "md-btn--glow" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...rest} />;
}
