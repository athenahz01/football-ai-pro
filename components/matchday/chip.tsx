import type { ButtonHTMLAttributes } from "react";

// Suggestion and filter chip. Active uses Volt on a dim Volt fill.

export function Chip({
  active = false,
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  const classes = ["md-chip", active ? "md-chip--active" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
