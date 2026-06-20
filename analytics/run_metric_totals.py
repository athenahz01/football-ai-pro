"""Materialize per player and per team metric totals.

A correct leaderboard over the full event set joins hundreds of thousands of rows
and can exceed the read only executor's statement timeout. This runner precomputes
the same totals, expected threat, VAEP, and expected goals, with counts, per player
or team, per competition and source, into two small tables. The grounded model then
answers totals and leaderboards from a tiny table well within the timeout.

The heavy aggregation runs here in the database with no statement timeout, and the
write is a single idempotent INSERT ... SELECT ... ON CONFLICT through the analytics
write path, never a language model. A second run upserts the same rows, so row
counts are stable. No metric is invented; every value is a sum over the derived
action tables, which only exist for StatsBomb data. API-Football competitions have
no coordinate metrics, so they get no rows here.

Run it like the other analytics jobs:

    python -m analytics.run_metric_totals
    python -m analytics.run_metric_totals --verify-idempotency
"""

from __future__ import annotations

import argparse
from typing import Any

from analytics import db

AGGREGATE_TABLES = ("player_metric_totals", "team_metric_totals")

PLAYER_TOTALS_SQL = """
    insert into player_metric_totals (
      player_id, competition_id, source, player_name,
      total_xt, total_vaep, total_vaep_offensive, total_vaep_defensive, total_xg,
      xt_action_count, shot_count, action_count, computed_at
    )
    with action_totals as (
      select sa.player_id, m.competition_id, m.source,
        sum(av.xt_value) as total_xt,
        sum(av.vaep_value) as total_vaep,
        sum(av.vaep_offensive) as total_vaep_offensive,
        sum(av.vaep_defensive) as total_vaep_defensive,
        count(av.xt_value) as xt_action_count,
        count(*) as action_count
      from spadl_actions sa
      join matches m on m.match_id = sa.match_id
      left join action_values av on av.action_id = sa.action_id
      where sa.player_id is not null
      group by sa.player_id, m.competition_id, m.source
    ),
    shot_totals as (
      select sx.player_id, m.competition_id, m.source,
        sum(sx.xg) as total_xg, count(*) as shot_count
      from shot_xg sx
      join matches m on m.match_id = sx.match_id
      where sx.player_id is not null
      group by sx.player_id, m.competition_id, m.source
    )
    select
      coalesce(a.player_id, s.player_id),
      coalesce(a.competition_id, s.competition_id),
      coalesce(a.source, s.source),
      p.name,
      coalesce(a.total_xt, 0),
      coalesce(a.total_vaep, 0),
      coalesce(a.total_vaep_offensive, 0),
      coalesce(a.total_vaep_defensive, 0),
      coalesce(s.total_xg, 0),
      coalesce(a.xt_action_count, 0),
      coalesce(s.shot_count, 0),
      coalesce(a.action_count, 0),
      now()
    from action_totals a
    full outer join shot_totals s
      on s.player_id = a.player_id
      and s.competition_id = a.competition_id
      and s.source = a.source
    left join players p on p.player_id = coalesce(a.player_id, s.player_id)
    on conflict (player_id, competition_id) do update set
      source = excluded.source,
      player_name = excluded.player_name,
      total_xt = excluded.total_xt,
      total_vaep = excluded.total_vaep,
      total_vaep_offensive = excluded.total_vaep_offensive,
      total_vaep_defensive = excluded.total_vaep_defensive,
      total_xg = excluded.total_xg,
      xt_action_count = excluded.xt_action_count,
      shot_count = excluded.shot_count,
      action_count = excluded.action_count,
      computed_at = excluded.computed_at
"""

TEAM_TOTALS_SQL = """
    insert into team_metric_totals (
      team_id, competition_id, source, team_name,
      total_xt, total_vaep, total_vaep_offensive, total_vaep_defensive, total_xg,
      xt_action_count, shot_count, action_count, computed_at
    )
    with action_totals as (
      select sa.team_id, m.competition_id, m.source,
        sum(av.xt_value) as total_xt,
        sum(av.vaep_value) as total_vaep,
        sum(av.vaep_offensive) as total_vaep_offensive,
        sum(av.vaep_defensive) as total_vaep_defensive,
        count(av.xt_value) as xt_action_count,
        count(*) as action_count
      from spadl_actions sa
      join matches m on m.match_id = sa.match_id
      left join action_values av on av.action_id = sa.action_id
      where sa.team_id is not null
      group by sa.team_id, m.competition_id, m.source
    ),
    shot_totals as (
      select sx.team_id, m.competition_id, m.source,
        sum(sx.xg) as total_xg, count(*) as shot_count
      from shot_xg sx
      join matches m on m.match_id = sx.match_id
      where sx.team_id is not null
      group by sx.team_id, m.competition_id, m.source
    )
    select
      coalesce(a.team_id, s.team_id),
      coalesce(a.competition_id, s.competition_id),
      coalesce(a.source, s.source),
      t.name,
      coalesce(a.total_xt, 0),
      coalesce(a.total_vaep, 0),
      coalesce(a.total_vaep_offensive, 0),
      coalesce(a.total_vaep_defensive, 0),
      coalesce(s.total_xg, 0),
      coalesce(a.xt_action_count, 0),
      coalesce(s.shot_count, 0),
      coalesce(a.action_count, 0),
      now()
    from action_totals a
    full outer join shot_totals s
      on s.team_id = a.team_id
      and s.competition_id = a.competition_id
      and s.source = a.source
    left join teams t on t.team_id = coalesce(a.team_id, s.team_id)
    on conflict (team_id, competition_id) do update set
      source = excluded.source,
      team_name = excluded.team_name,
      total_xt = excluded.total_xt,
      total_vaep = excluded.total_vaep,
      total_vaep_offensive = excluded.total_vaep_offensive,
      total_vaep_defensive = excluded.total_vaep_defensive,
      total_xg = excluded.total_xg,
      xt_action_count = excluded.xt_action_count,
      shot_count = excluded.shot_count,
      action_count = excluded.action_count,
      computed_at = excluded.computed_at
"""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Materialize player and team metric totals.",
    )
    parser.add_argument(
        "--verify-idempotency",
        action="store_true",
        help="Run twice and verify the aggregate row counts do not change.",
    )
    args = parser.parse_args()

    first_counts = run_once()

    if args.verify_idempotency:
        print("Running metric totals a second time to verify idempotency.")
        second_counts = run_once()
        assert_counts_match(first_counts, second_counts)
        print("Idempotency check passed. Row counts were unchanged.")


def run_once() -> dict[str, int]:
    with db.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(PLAYER_TOTALS_SQL)
            cursor.execute(TEAM_TOTALS_SQL)
        connection.commit()

        counts = table_counts(connection)
        print_summary(counts)
        return counts


def table_counts(connection: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in AGGREGATE_TABLES:
        frame = db.read_dataframe(connection, f"select count(*) as n from {table}")
        counts[table] = int(frame["n"].iloc[0])
    return counts


def assert_counts_match(
    first_counts: dict[str, int],
    second_counts: dict[str, int],
) -> None:
    differences = [
        table
        for table in AGGREGATE_TABLES
        if first_counts[table] != second_counts[table]
    ]

    if not differences:
        return

    detail = ", ".join(
        f"{table}: {first_counts[table]} then {second_counts[table]}"
        for table in differences
    )
    raise RuntimeError(f"Idempotency check failed. Row count changes: {detail}")


def print_summary(counts: dict[str, int]) -> None:
    print("Metric totals row summary:")
    for table in AGGREGATE_TABLES:
        print(f"{table}: {counts[table]} rows")


if __name__ == "__main__":
    main()
