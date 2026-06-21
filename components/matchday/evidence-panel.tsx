"use client";

import { useEffect, useMemo, useState } from "react";

import type { CitedEvent } from "@/lib/insights/pitch";
import { PitchViz, type PitchHighlight } from "./dataviz/pitch-viz";

// The evidence-backed answer panel, our version of FIFA's feature. Beneath an answer
// about events, it shows the real cited events as a filterable list of cards, each with
// the player, the minute, the team, and the outcome, drawn from the fixed read only
// evidence query, so the list is the real evidence behind the answer, not a re-summary.
// Filters by team and by event type. Selecting an event draws it on the pitch, our
// stylized representation of that moment, since we have event data, not footage or
// avatars. Where a competition carries no event coordinates, the panel shows an honest
// note and no faked evidence.

type EventType = "Shot" | "Pass";

export function EvidencePanel({
  kind,
  id,
  name,
  initialType,
}: {
  kind: "player" | "team";
  id: string;
  name: string;
  initialType: EventType;
}) {
  const [type, setType] = useState<EventType>(initialType);
  const [events, setEvents] = useState<CitedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Deferred so the reset does not run synchronously inside the effect body.
    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setSelectedId(null);
      }
    });
    fetch("/api/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, type }),
    })
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((data: { events?: CitedEvent[] }) => {
        if (!active) return;
        setEvents(data.events ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setEvents([]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, id, type]);

  const teams = useMemo(
    () => Array.from(new Set(events.map((event) => event.team))).filter(Boolean).sort(),
    [events],
  );

  const filtered = events.filter((event) => teamFilter === "all" || event.team === teamFilter);
  const selected = filtered.find((event) => event.id === selectedId) ?? null;

  const shots =
    type === "Shot"
      ? filtered.map((event) => ({
          x: event.x,
          y: event.y,
          minute: event.minute,
          outcome: event.outcome,
          goal: event.goal,
          xg: event.xg,
          player: event.player,
          team: event.team,
        }))
      : [];
  const passes =
    type === "Pass"
      ? filtered.map((event) => ({
          x: event.x,
          y: event.y,
          endX: event.endX ?? event.x,
          endY: event.endY ?? event.y,
          minute: event.minute,
          completed: event.outcome === "Complete",
          player: event.player,
          team: event.team,
        }))
      : [];

  const highlight: PitchHighlight | null = selected
    ? { x: selected.x, y: selected.y, endX: selected.endX, endY: selected.endY, goal: selected.goal }
    : null;

  return (
    <section className="md-panel" style={{ marginTop: "var(--space-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
        <span className="md-overline" style={{ color: "var(--md-volt)" }}>Evidence, {name}</span>
        <div className="md-seg" role="group" aria-label="Event type">
          {(["Shot", "Pass"] as EventType[]).map((value) => (
            <button key={value} type="button" className="md-seg-item" aria-pressed={type === value} onClick={() => setType(value)}>
              {value === "Shot" ? "Shots" : "Passes"}
            </button>
          ))}
        </div>
      </div>

      <p className="md-small" style={{ color: "var(--md-text-lo)", marginTop: 0, marginBottom: "var(--space-3)" }}>
        The real events behind this answer, our event data drawn on a pitch, not
        broadcast video. Select an event to see it in context. The richness depends on
        the competition carrying event coordinates.
      </p>

      {loading ? (
        <p className="md-small" style={{ color: "var(--md-text-mid)" }}>Loading the evidence.</p>
      ) : events.length === 0 ? (
        <p className="md-small" style={{ color: "var(--md-text-lo)" }}>
          No event evidence is available for this answer. This competition does not
          carry event coordinates, so the answer keeps its simpler visual.
        </p>
      ) : (
        <>
          <PitchViz title={`${name} ${type === "Shot" ? "shots" : "passes"}`} shots={shots} passes={passes} defaultMode={type === "Shot" ? "shots" : "passes"} highlight={highlight} />

          {teams.length > 1 ? (
            <div style={{ marginTop: "var(--space-3)" }}>
              <label className="md-small" style={{ color: "var(--md-text-lo)", display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                Team
                <select className="md-select" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
                  <option value="all">All teams</option>
                  {teams.map((team) => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-2)", maxHeight: "320px", overflowY: "auto" }}>
            {filtered.map((event) => {
              const isSelected = event.id === selectedId;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : event.id)}
                    aria-pressed={isSelected}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-3)",
                      padding: "var(--space-2) var(--space-3)",
                      background: isSelected ? "var(--md-volt-dim)" : "var(--md-sunken)",
                      border: `1px solid ${isSelected ? "var(--md-volt)" : "var(--md-hairline)"}`,
                      borderRadius: "var(--r-sm)",
                      cursor: "pointer",
                      color: "var(--md-text-hi)",
                    }}
                  >
                    <span className="md-tnum md-ltr" style={{ color: "var(--md-text-lo)", width: "36px", flex: "none" }}>
                      {event.minute === null ? "?" : `${event.minute}'`}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="md-small" style={{ display: "block", color: "var(--md-text-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.player}
                      </span>
                      <span className="md-small" style={{ color: "var(--md-text-lo)" }}>{event.team}</span>
                    </span>
                    <span
                      className="md-small"
                      style={{ flex: "none", color: event.goal ? "var(--md-magenta)" : "var(--md-text-mid)", fontWeight: event.goal ? 700 : 400 }}
                    >
                      {event.outcome}
                      {event.xg !== null ? ` · ${event.xg.toFixed(2)} xG` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
