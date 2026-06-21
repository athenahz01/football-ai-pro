import Link from "next/link";

import { Badge } from "@/components/matchday/badge";
import { PanelCard } from "@/components/matchday/cards";
import { HeroAsk } from "@/components/matchday/hero-ask";

export const dynamic = "force-dynamic";

// The landing screen, hero first. A first time visitor should understand the product
// in five seconds: ask football anything and get a real, grounded answer. The proof
// below describes the guarantees and the experience without inventing any numbers,
// because the promise is that numbers only ever come from a real query. The actual
// figures live on the answer screen, one ask away.

export default function LandingPage() {
  return (
    <main className="md-screen">
      <div className="md-container">
        <section className="md-hero">
          <div className="md-hero-copy">
            <span
              className="md-overline"
              style={{
                color: "var(--md-text-lo)",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <Badge kind="grounded" /> Grounded football intelligence
            </span>
            <h1
              className="md-display-1"
              style={{ marginTop: "var(--space-4)" }}
            >
              Ask football anything.
            </h1>
            <p
              className="md-body"
              style={{
                color: "var(--md-text-mid)",
                marginTop: "var(--space-4)",
                maxWidth: "46ch",
              }}
            >
              Real numbers, pitch maps, 3D replays. No made up stats, ever. Every
              answer leads with the answer, then the number, then the proof.
            </p>
            <div style={{ marginTop: "var(--space-6)" }}>
              <HeroAsk />
            </div>
          </div>

          <PanelCard className="md-hero-proof">
            <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
              Every answer ships with
            </span>
            <ul className="md-proof-list">
              <li>
                <Badge kind="grounded" />
                <span>
                  The exact query that produced it, and the rows it returned. Open
                  the work on any answer.
                </span>
              </li>
              <li>
                <Badge kind="tracking" />
                <span>
                  3D replays of our own computer vision tracking, labelled honestly
                  in image space.
                </span>
              </li>
              <li>
                <Badge kind="entertainment" />
                <span>
                  Predictions are flagged as model estimates, never betting advice.
                </span>
              </li>
            </ul>
          </PanelCard>
        </section>

        <section className="md-proof-grid">
          <ProofCard
            title="Grounded answers"
            body="Ask in plain language. The answer is built from a real query against real data, and the numbers in the words come only from the rows."
            href="/ask"
            cta="Ask a question"
          />
          <ProofCard
            title="Compare and scout"
            body="Put two players or teams side by side, or rank a competition by a metric. A feed that does not carry a number says so, never a zero."
            href="/compare"
            cta="Open compare"
          />
          <ProofCard
            title="3D replays"
            body="Watch our tracking animate a processed clip in 3D, with its license and image space units shown plainly."
            href="/replay"
            cta="Watch in 3D"
          />
        </section>
      </div>
    </main>
  );
}

function ProofCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <PanelCard>
      <h2 className="md-title" style={{ margin: 0 }}>
        {title}
      </h2>
      <p
        className="md-body"
        style={{ color: "var(--md-text-mid)", margin: "var(--space-3) 0" }}
      >
        {body}
      </p>
      <Link
        href={href}
        className="md-navlink"
        style={{ color: "var(--md-volt)", padding: 0 }}
      >
        {cta} {"→"}
      </Link>
    </PanelCard>
  );
}
