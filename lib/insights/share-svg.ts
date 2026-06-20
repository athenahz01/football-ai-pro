// Small helpers for the shareable SVG cards. Pure string building plus the
// response wrapper. The cards show only real queried numbers and credit the data
// source, including the StatsBomb attribution that is also in the app footer.

export function escapeXml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return "&quot;";
    }
  });
}

export function creditLines(source: string, height: number): string {
  const lines = ["Numbers from a live database query."];
  if (source === "statsbomb") {
    lines.push("World Cup data provided by StatsBomb Open Data.");
  } else if (source === "api_football") {
    lines.push("Match data provided by API-Football.");
  }

  return lines
    .map(
      (line, index) =>
        `<text x="40" y="${height - 38 + index * 18}" font-size="12" fill="#999">${escapeXml(line)}</text>`,
    )
    .join("");
}

export function messageCard(message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="160" viewBox="0 0 700 160" font-family="system-ui, sans-serif">
    <rect x="0" y="0" width="700" height="160" fill="#ffffff" stroke="#e2e2e2" />
    <text x="40" y="44" font-size="22" font-weight="700" fill="#111">Football AI Pro</text>
    <text x="40" y="84" font-size="15" fill="#555">${escapeXml(message)}</text>
  </svg>`;
}

export function svgResponse(svg: string): Response {
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
