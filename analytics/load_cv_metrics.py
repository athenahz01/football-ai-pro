"""Load computer vision movement metrics into the broadcast_cv source.

This loader reads the local metrics file produced by the CV pipeline and writes it
into cv_clips and cv_track_metrics through the trusted analytics write path, never
model SQL. It is the one place that namespaces the ids with a cv: prefix and labels
the rows with source broadcast_cv, mirroring how the ETL labels StatsBomb and
API-Football. It is idempotent: it upserts on the namespaced ids, so a second run
produces the same rows and stable row counts.

The legal gate carries forward. The metrics file records whether it was derived
from a rights confirmed clip, and this loader refuses to load anything that was
not. No video is touched here; only the already computed metrics file is read.

Run it after computing metrics:

    python -m analytics.load_cv_metrics --metrics cv/output/football_tennis.metrics.json
    python -m analytics.load_cv_metrics --metrics cv/output/football_tennis.metrics.json --verify-idempotency
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from analytics import db

CV_TABLES = ("cv_clips", "cv_track_metrics")
ID_PREFIX = "cv:"
DEFAULT_METRICS = db.ROOT_DIR / "cv" / "output" / "football_tennis.metrics.json"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load CV movement metrics into the broadcast_cv source."
    )
    parser.add_argument(
        "--metrics",
        type=Path,
        default=DEFAULT_METRICS,
        help="Metrics JSON produced by cv.metrics.",
    )
    parser.add_argument(
        "--verify-idempotency",
        action="store_true",
        help="Run twice and verify the broadcast_cv row counts do not change.",
    )
    args = parser.parse_args()

    metrics = json.loads(args.metrics.read_text(encoding="utf-8"))
    metadata = metrics.get("metadata", {})

    if not metadata.get("rights_confirmed", False):
        raise SystemExit(
            "Refusing to load. These metrics were not derived from a rights confirmed clip."
        )

    first_counts = load_once(metadata, metrics.get("tracks", []))

    if args.verify_idempotency:
        print("Loading a second time to verify idempotency.")
        second_counts = load_once(metadata, metrics.get("tracks", []))
        assert_counts_match(first_counts, second_counts)
        print("Idempotency check passed. Row counts were unchanged.")


def load_once(
    metadata: dict[str, Any],
    tracks: list[dict[str, Any]],
) -> dict[str, int]:
    clip_id = f"{ID_PREFIX}{metadata.get('clip_name', 'clip')}"
    clip_row = to_clip_row(clip_id, metadata)
    track_rows = [to_track_row(clip_id, metadata, track) for track in tracks]

    with db.connect() as connection:
        db.upsert_rows(connection, "cv_clips", [clip_row], ("clip_id",))
        db.upsert_rows(
            connection,
            "cv_track_metrics",
            track_rows,
            ("clip_id", "track_id"),
        )
        counts = table_counts(connection)

    print_summary(clip_id, len(track_rows), counts)
    return counts


def to_clip_row(clip_id: str, metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "clip_id": clip_id,
        "source": "broadcast_cv",
        "clip_name": str(metadata.get("clip_name", "clip")),
        "source_video": nullable(metadata.get("source_video")),
        "license": nullable(metadata.get("license")),
        "license_url": nullable(metadata.get("license_url")),
        "author": nullable(metadata.get("author")),
        "fps": metadata.get("fps"),
        "frame_count": metadata.get("frame_count"),
        "width": metadata.get("width"),
        "height": metadata.get("height"),
        "calibrated": bool(metadata.get("calibrated", False)),
        "distance_units": str(metadata.get("distance_units", "pixels")),
        "speed_units": str(metadata.get("speed_units", "pixels_per_second")),
    }


def to_track_row(
    clip_id: str,
    metadata: dict[str, Any],
    track: dict[str, Any],
) -> dict[str, Any]:
    return {
        "clip_id": clip_id,
        "track_id": f"{clip_id}:{track.get('track_id')}",
        "source": "broadcast_cv",
        "class": str(track.get("class", "unknown")),
        "frame_count": int(track.get("frame_count", 0)),
        "first_frame": track.get("first_frame"),
        "last_frame": track.get("last_frame"),
        "time_tracked_seconds": track.get("time_tracked_seconds"),
        "total_distance": track.get("total_distance"),
        "top_speed": track.get("top_speed"),
        "average_speed": track.get("average_speed"),
        "distance_units": str(
            track.get("distance_units", metadata.get("distance_units", "pixels"))
        ),
        "speed_units": str(
            track.get("speed_units", metadata.get("speed_units", "pixels_per_second"))
        ),
    }


def table_counts(connection: Any) -> dict[str, int]:
    return {table: db.count_rows(connection, table) for table in CV_TABLES}


def assert_counts_match(
    first_counts: dict[str, int],
    second_counts: dict[str, int],
) -> None:
    differences = [
        table for table in CV_TABLES if first_counts[table] != second_counts[table]
    ]

    if not differences:
        return

    detail = ", ".join(
        f"{table}: {first_counts[table]} then {second_counts[table]}"
        for table in differences
    )
    raise RuntimeError(f"Idempotency check failed. Row count changes: {detail}")


def print_summary(clip_id: str, track_count: int, counts: dict[str, int]) -> None:
    print(f"Loaded clip {clip_id} with {track_count} tracks.")
    for table in CV_TABLES:
        print(f"{table}: final rows {counts[table]}")


def nullable(value: Any) -> Any:
    if value is None or value == "":
        return None
    return value


if __name__ == "__main__":
    main()
