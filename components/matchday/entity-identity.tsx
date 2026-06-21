// Visual identity for a player or team: a stable colour and a crest style monogram,
// so an entity is never a bare name in a row. The colour is generated deterministically
// from the name, so it is stable per entity but is a generated placeholder, not an
// official club colour or crest. Real imagery can replace it later with no API change.

type EntityKind = "player" | "team";
type Size = "sm" | "md" | "lg";

const DIMENSION: Record<Size, number> = { sm: 32, md: 44, lg: 72 };
const FONT: Record<Size, number> = { sm: 13, md: 17, lg: 26 };

export function entityHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function EntityIdentity({
  name,
  kind,
  size = "md",
}: {
  name: string;
  kind: EntityKind;
  size?: Size;
}) {
  const hue = entityHue(name);
  const dim = DIMENSION[size];
  // Lightness kept low so the white monogram clears AA contrast.
  const top = `hsl(${hue} 55% 42%)`;
  const bottom = `hsl(${(hue + 24) % 360} 60% 26%)`;

  return (
    <span
      aria-hidden
      style={{
        width: dim,
        height: dim,
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: kind === "team" ? "var(--r-md)" : "50%",
        background: `linear-gradient(160deg, ${top}, ${bottom})`,
        border: "1px solid rgba(255,255,255,0.12)",
        color: "#ffffff",
        fontFamily: "var(--md-font-display)",
        fontSize: FONT[size],
        letterSpacing: "0.02em",
        lineHeight: 1,
      }}
    >
      {monogram(name)}
    </span>
  );
}
