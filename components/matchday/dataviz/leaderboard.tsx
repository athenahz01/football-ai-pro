// Leaderboard rows with bars, lightweight and SVG free (plain divs). The leader bar
// is Volt, the rest neutral. Bars animate their width on load (480ms), disabled under
// reduced motion by the global rule. The numbers are shown as text, so the rows are
// their own accessible alternative; the bars are decorative.

export type LeaderboardItem = {
  label: string;
  value: number;
  display: string;
};

export function Leaderboard({ items }: { items: LeaderboardItem[] }) {
  const max = items.reduce((peak, item) => Math.max(peak, item.value), 0);

  return (
    <div>
      {items.map((item, index) => {
        const pct = max > 0 ? Math.max(2, (item.value / max) * 100) : 0;
        const isLeader = index === 0;
        return (
          <div className="md-lb-row" key={`${item.label}-${index}`}>
            <span className="md-lb-name">{item.label}</span>
            <span className="md-lb-value md-ltr">{item.display}</span>
            <div className="md-lb-track" aria-hidden>
              <div
                className="md-lb-fill"
                style={{
                  width: `${pct}%`,
                  background: isLeader
                    ? "var(--md-volt)"
                    : "var(--md-text-lo)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
