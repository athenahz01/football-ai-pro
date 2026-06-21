"""Load per frame track positions into the broadcast_cv source for the 3D replay.

cv_track_metrics holds the aggregate movement metrics. The 3D replay needs the
frame by frame positions, which this loader writes into cv_track_points. It reads
the tracks file the CV tracking step produced, normalizes each track centre to the
video frame so positions are in 0 to 1 image space, and upserts them through the
trusted analytics write path, never model SQL. It is idempotent on clip id, track
id, and frame index, so a second run produces the same rows.

Positions are image space, not a real pitch in meters. The current sample is not
calibrated. A calibrated, rights confirmed clip is what would make them meters.

The legal gate carries forward. The tracks file records whether it came from a
rights confirmed clip, and this loader refuses to load anything that did not. No
video is touched here. The clip row must already exist in cv_clips, so run
analytics.load_cv_metrics first.

Run it after computing tracks and loading the clip metrics:

    python -m analytics.load_cv_track_points --tracks cv/output/football_tennis.tracks.json
    python -m analytics.load_cv_track_points --tracks cv/output/football_tennis.tracks.json --verify-idempotency
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from analytics import db

ID_PREFIX = "cv:"
DEFAULT_TRACKS = db.ROOT_DIR / "cv" / "output" / "football_tennis.tracks.json"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load per frame CV track points into the broadcast_cv source."
    )
    parser.add_argument(
        "--tracks",
        type=Path,
        default=DEFAULT_TRACKS,
        help="Tracks JSON produced by cv.track.",
    )
    parser.add_argument(
        "--verify-idempotency",
        action="store_true",
        help="Run twice and verify the cv_track_points row count does not change.",
    )
    args = parser.parse_args()

    tracks_data = json.loads(args.tracks.read_text(encoding="utf-8"))
    metadata = tracks_data.get("metadata", {})

    if not metadata.get("rights_confirmed", False):
        raise SystemExit(
            "Refusing to load. These tracks were not produced from a rights confirmed clip."
        )

    rows = build_point_rows(metadata, tracks_data.get("tracks", []))

    first_count = load_once(rows)

    if args.verify_idempotency:
        print("Loading a second time to verify idempotency.")
        second_count = load_once(rows)
        if first_count != second_count:
            raise RuntimeError(
                f"Idempotency check failed. cv_track_points rows were {first_count} then {second_count}."
            )
        print("Idempotency check passed. Row count was unchanged.")


def build_point_rows(
    metadata: dict[str, Any],
    tracks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    clip_name = Path(metadata.get("input_video", "clip")).stem or "clip"
    clip_id = f"{ID_PREFIX}{clip_name}"
    width = float(metadata.get("width") or 0)
    height = float(metadata.get("height") or 0)

    if width <= 0 or height <= 0:
        raise SystemExit(
            "The tracks file has no frame dimensions, so positions cannot be normalized."
        )

    rows: list[dict[str, Any]] = []
    for track in tracks:
        track_id = f"{clip_id}:{track.get('track_id')}"
        for point in track.get("trajectory", []):
            center = point.get("center", {})
            rows.append(
                {
                    "clip_id": clip_id,
                    "track_id": track_id,
                    "frame_index": int(point["frame_index"]),
                    "time_seconds": point.get("time_seconds"),
                    "x": round(float(center["x"]) / width, 6),
                    "y": round(float(center["y"]) / height, 6),
                    "source": "broadcast_cv",
                }
            )

    return rows


def load_once(rows: list[dict[str, Any]]) -> int:
    with db.connect() as connection:
        db.upsert_rows(
            connection,
            "cv_track_points",
            rows,
            ("clip_id", "track_id", "frame_index"),
        )
        count = db.count_rows(connection, "cv_track_points")

    print(f"cv_track_points: wrote {len(rows)}, final rows {count}")
    return count


if __name__ == "__main__":
    main()
