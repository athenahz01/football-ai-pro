from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any, Iterable, Sequence

import pandas as pd
import psycopg
from dotenv import load_dotenv
from psycopg import sql

ROOT_DIR = Path(__file__).resolve().parents[1]
BATCH_SIZE = 1_000

ALLOWED_UPSERT_TABLES = {
    "spadl_actions",
    "action_values",
    "shot_xg",
    "team_ratings",
    "match_predictions",
    "cv_clips",
    "cv_track_metrics",
    "cv_track_points",
}


def load_database_url() -> str:
    load_dotenv(ROOT_DIR / ".env.local")
    database_url = os.getenv("SUPABASE_DB_URL")

    if not database_url:
        raise RuntimeError("SUPABASE_DB_URL is required in .env.local.")

    return database_url


def connect() -> psycopg.Connection[Any]:
    return psycopg.connect(load_database_url())


def read_loaded_matches(connection: psycopg.Connection[Any]) -> pd.DataFrame:
    query = """
        select
          match_id,
          competition_id,
          home_team_id,
          away_team_id
        from matches
        order by match_date, match_id
    """

    return read_dataframe(connection, query)


def read_match_events(
    connection: psycopg.Connection[Any],
    match_id: str,
) -> pd.DataFrame:
    query = """
        select
          e.event_id,
          e.match_id,
          e.sequence,
          e.period,
          e.minute,
          e.second,
          e.type,
          e.team_id,
          e.player_id,
          e.possession_team_id,
          e.location_x,
          e.location_y,
          e.end_location_x,
          e.end_location_y,
          e.duration_seconds,
          e.outcome,
          e.body_part,
          e.under_pressure,
          e.play_pattern,
          e.is_cross,
          e.pass_type,
          e.shot_type,
          m.competition_id,
          m.home_team_id
        from match_events e
        join matches m on m.match_id = e.match_id
        where e.match_id = %s
        order by e.period, e.sequence
    """

    return read_dataframe(connection, query, (match_id,))


def read_all_match_events(connection: psycopg.Connection[Any]) -> pd.DataFrame:
    query = """
        select
          e.event_id,
          e.match_id,
          e.sequence,
          e.period,
          e.minute,
          e.second,
          e.type,
          e.team_id,
          e.player_id,
          e.possession_team_id,
          e.location_x,
          e.location_y,
          e.end_location_x,
          e.end_location_y,
          e.duration_seconds,
          e.outcome,
          e.body_part,
          e.under_pressure,
          e.play_pattern,
          e.is_cross,
          e.pass_type,
          e.shot_type,
          m.competition_id,
          m.home_team_id
        from match_events e
        join matches m on m.match_id = e.match_id
        order by e.match_id, e.period, e.sequence
    """

    return read_dataframe(connection, query)


def upsert_rows(
    connection: psycopg.Connection[Any],
    table: str,
    rows: Sequence[dict[str, Any]],
    conflict_columns: Sequence[str],
) -> None:
    if not rows:
        return

    if table not in ALLOWED_UPSERT_TABLES:
        raise ValueError(f"Unsupported upsert table: {table}")

    columns = list(rows[0].keys())
    update_columns = [column for column in columns if column not in conflict_columns]
    column_sql = sql.SQL(", ").join(sql.Identifier(column) for column in columns)
    placeholder_sql = sql.SQL(", ").join(sql.Placeholder() for _ in columns)
    conflict_sql = sql.SQL(", ").join(sql.Identifier(column) for column in conflict_columns)
    update_sql = sql.SQL(", ").join(
        sql.SQL("{} = excluded.{}").format(
            sql.Identifier(column),
            sql.Identifier(column),
        )
        for column in update_columns
    )

    statement = sql.SQL(
        """
        insert into {table} ({columns})
        values ({placeholders})
        on conflict ({conflict_columns})
        do update set {updates}
        """
    ).format(
        table=sql.Identifier(table),
        columns=column_sql,
        placeholders=placeholder_sql,
        conflict_columns=conflict_sql,
        updates=update_sql,
    )

    with connection.cursor() as cursor:
        for batch in batched(rows, BATCH_SIZE):
            values = [
                tuple(normalize_value(row[column]) for column in columns)
                for row in batch
            ]
            cursor.executemany(statement, values)

    connection.commit()


def count_rows(connection: psycopg.Connection[Any], table: str) -> int:
    if table not in ALLOWED_UPSERT_TABLES:
        raise ValueError(f"Unsupported count table: {table}")

    statement = sql.SQL("select count(*) from {table}").format(
        table=sql.Identifier(table),
    )

    with connection.cursor() as cursor:
        cursor.execute(statement)
        value = cursor.fetchone()

    return int(value[0]) if value is not None else 0


def read_dataframe(
    connection: psycopg.Connection[Any],
    query: str,
    params: Sequence[Any] | None = None,
) -> pd.DataFrame:
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()
        columns = [description.name for description in cursor.description]

    return pd.DataFrame(rows, columns=columns)


def batched(
    rows: Sequence[dict[str, Any]],
    size: int,
) -> Iterable[Sequence[dict[str, Any]]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def normalize_value(value: Any) -> Any:
    if value is pd.NA:
        return None

    if isinstance(value, float) and math.isnan(value):
        return None

    return value
