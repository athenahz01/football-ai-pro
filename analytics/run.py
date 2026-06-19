from __future__ import annotations

import argparse
from typing import Any

import pandas as pd

from analytics import db
from analytics.spadl_adapter import convert_events_to_spadl
from analytics.vaep import add_vaep_values
from analytics.xg import compute_shot_xg
from analytics.xthreat import add_xt_values

DERIVED_TABLES = ("spadl_actions", "action_values", "shot_xg")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Football AI Pro analytics.")
    parser.add_argument(
        "--verify-idempotency",
        action="store_true",
        help="Run twice and verify derived table row counts do not change.",
    )
    args = parser.parse_args()

    first_counts = run_once()

    if args.verify_idempotency:
        print("Running analytics a second time to verify idempotency.")
        second_counts = run_once()
        assert_counts_match(first_counts, second_counts)
        print("Idempotency check passed. Row counts were unchanged.")


def run_once() -> dict[str, int]:
    with db.connect() as connection:
        events = db.read_all_match_events(connection)

        if events.empty:
            print("No match events found in the neutral schema.")
            counts = table_counts(connection)
            print_summary({}, counts)
            return counts

        actions = convert_events_to_spadl(events)
        valued_actions = add_xt_values(actions)
        valued_actions = add_vaep_values(valued_actions)
        shot_xg = compute_shot_xg(valued_actions)

        action_rows = to_spadl_action_rows(valued_actions)
        value_rows = to_action_value_rows(valued_actions)
        shot_xg_rows = to_shot_xg_rows(shot_xg)

        db.upsert_rows(connection, "spadl_actions", action_rows, ("action_id",))
        db.upsert_rows(connection, "action_values", value_rows, ("action_id",))
        db.upsert_rows(connection, "shot_xg", shot_xg_rows, ("action_id",))

        counts = table_counts(connection)
        print_summary(
            {
                "spadl_actions": len(action_rows),
                "action_values": len(value_rows),
                "shot_xg": len(shot_xg_rows),
            },
            counts,
        )

        return counts


def to_spadl_action_rows(actions: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for _, action in actions.iterrows():
        source_event_id = str(action["original_event_id"])
        rows.append(
            {
                "action_id": source_event_id,
                "match_id": str(action["game_id"]),
                "action_order": int(action["action_id"]),
                "source_event_id": source_event_id,
                "period": int(action["period_id"]),
                "time_seconds": float(action["time_seconds"]),
                "team_id": nullable_string(action["team_id"]),
                "player_id": nullable_string(action["player_id"]),
                "start_x": float(action["start_x"]),
                "start_y": float(action["start_y"]),
                "end_x": float(action["end_x"]),
                "end_y": float(action["end_y"]),
                "spadl_type": str(action["type_name"]),
                "spadl_result": str(action["result_name"]),
                "spadl_bodypart": nullable_string(action["bodypart_name"]),
            }
        )

    return rows


def to_action_value_rows(actions: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for _, action in actions.iterrows():
        rows.append(
            {
                "action_id": str(action["original_event_id"]),
                "xt_value": nullable_float(action["xt_value"]),
                "vaep_offensive": nullable_float(action["vaep_offensive"]),
                "vaep_defensive": nullable_float(action["vaep_defensive"]),
                "vaep_value": nullable_float(action["vaep_value"]),
            }
        )

    return rows


def to_shot_xg_rows(shots: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for _, shot in shots.iterrows():
        rows.append(
            {
                "action_id": str(shot["original_event_id"]),
                "match_id": str(shot["game_id"]),
                "team_id": nullable_string(shot["team_id"]),
                "player_id": nullable_string(shot["player_id"]),
                "xg": float(shot["xg"]),
            }
        )

    return rows


def table_counts(connection: Any) -> dict[str, int]:
    return {table: db.count_rows(connection, table) for table in DERIVED_TABLES}


def assert_counts_match(
    first_counts: dict[str, int],
    second_counts: dict[str, int],
) -> None:
    differences = [
        table
        for table in DERIVED_TABLES
        if first_counts[table] != second_counts[table]
    ]

    if not differences:
        return

    detail = ", ".join(
        f"{table}: {first_counts[table]} then {second_counts[table]}"
        for table in differences
    )
    raise RuntimeError(f"Idempotency check failed. Row count changes: {detail}")


def print_summary(written_counts: dict[str, int], final_counts: dict[str, int]) -> None:
    print("Analytics row summary:")

    for table in DERIVED_TABLES:
        written = written_counts.get(table, 0)
        final = final_counts.get(table, 0)
        print(f"{table}: wrote {written}, final rows {final}")


def nullable_string(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None

    return str(value)


def nullable_float(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None

    return float(value)


if __name__ == "__main__":
    main()
