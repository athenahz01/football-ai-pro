from __future__ import annotations

import argparse
import json
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from cv.homography import Calibration, load_calibration

# Movement metrics for the CV pipeline. From the per object tracks it derives, for
# each track, the total distance travelled, the top speed, the average speed, and
# the time tracked. When a calibration is supplied it maps the track centres from
# pixels to pitch meters first and the metrics are in meters; otherwise the metrics
# stay in image pixels. The units are labelled explicitly in the output and are
# never relabelled as meters when they are pixels.
#
# This module reads the tracks file the tracking step produced and writes a local
# metrics file. It touches no video itself, but it refuses to run on tracks that
# were not produced from a rights confirmed clip, so the legal gate carries
# forward. It imports nothing from the product and touches no database.

SOURCES_PATH = Path(__file__).resolve().parent / "sample_sources.json"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "output" / "metrics.json"


def main() -> None:
    args = parse_args()
    run_metrics(args)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Derive per-track movement metrics from CV tracks."
    )
    parser.add_argument(
        "--tracks",
        type=Path,
        required=True,
        help="Tracks JSON produced by cv.track.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output JSON file for per-track movement metrics.",
    )
    parser.add_argument(
        "--calibration",
        type=Path,
        default=None,
        help=(
            "Optional pixel to pitch calibration JSON. Supply one only for a "
            "calibrated, rights confirmed clip. Without it, metrics are in pixels."
        ),
    )
    return parser.parse_args()


def run_metrics(args: argparse.Namespace) -> None:
    tracks_data = json.loads(args.tracks.read_text(encoding="utf-8"))
    metadata = tracks_data.get("metadata", {})

    if not metadata.get("rights_confirmed", False):
        raise SystemExit(
            "Refusing to compute metrics. The tracks were not produced from a rights confirmed clip."
        )

    calibration = load_calibration(args.calibration) if args.calibration else None
    distance_units, speed_units = resolve_units(calibration)
    license_info = lookup_license(metadata.get("input_video", ""))

    track_metrics = [
        compute_track_metrics(track, calibration, distance_units, speed_units)
        for track in tracks_data.get("tracks", [])
    ]

    output = {
        "metadata": {
            "generated_at": datetime.now(UTC).isoformat(),
            "clip_name": clip_name_from_video(metadata.get("input_video", "clip")),
            "source_video": metadata.get("input_video"),
            "license": license_info["license"],
            "license_url": license_info["license_url"],
            "author": license_info["author"],
            "fps": metadata.get("fps"),
            "width": metadata.get("width"),
            "height": metadata.get("height"),
            "frame_count": metadata.get("processed_frames"),
            "calibrated": calibration is not None,
            "distance_units": distance_units,
            "speed_units": speed_units,
            "rights_confirmed": True,
            "units_note": (
                "Metrics are in pitch meters because a calibration was supplied."
                if calibration is not None
                else "Metrics are in image pixels. This clip is not calibrated, so these are not meters."
            ),
        },
        "tracks": track_metrics,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(
        f"Wrote movement metrics for {len(track_metrics)} tracks "
        f"({distance_units}) to {args.output}"
    )


def resolve_units(calibration: Calibration | None) -> tuple[str, str]:
    if calibration is None:
        return "pixels", "pixels_per_second"

    base = calibration.pitch_units
    return base, f"{base}_per_second"


def compute_track_metrics(
    track: dict[str, Any],
    calibration: Calibration | None,
    distance_units: str,
    speed_units: str,
) -> dict[str, Any]:
    trajectory = track.get("trajectory", [])
    points = np.array([[p["center"]["x"], p["center"]["y"]] for p in trajectory], dtype=float)
    times = [p.get("time_seconds") for p in trajectory]

    if calibration is not None and len(points) > 0:
        points = calibration.map_points(points)

    total_distance = 0.0
    top_speed = 0.0
    speeds: list[float] = []

    for index in range(1, len(points)):
        segment = float(np.linalg.norm(points[index] - points[index - 1]))
        total_distance += segment

        previous_time = times[index - 1]
        current_time = times[index]
        if previous_time is not None and current_time is not None:
            dt = current_time - previous_time
            if dt > 0:
                speed = segment / dt
                speeds.append(speed)
                top_speed = max(top_speed, speed)

    time_tracked = compute_time_tracked(times)
    average_speed = total_distance / time_tracked if time_tracked > 0 else 0.0

    return {
        "track_id": track.get("track_id"),
        "class": track.get("class"),
        "frame_count": track.get("frame_count", len(trajectory)),
        "first_frame": track.get("first_frame"),
        "last_frame": track.get("last_frame"),
        "time_tracked_seconds": round(time_tracked, 3),
        "total_distance": round(total_distance, 3),
        "top_speed": round(top_speed, 3),
        "average_speed": round(average_speed, 3),
        "distance_units": distance_units,
        "speed_units": speed_units,
    }


def compute_time_tracked(times: list[Any]) -> float:
    valid = [t for t in times if t is not None]
    if len(valid) < 2:
        return 0.0

    span = valid[-1] - valid[0]
    return span if span > 0 and math.isfinite(span) else 0.0


def clip_name_from_video(input_video: str) -> str:
    stem = Path(input_video).stem
    return stem if stem else "clip"


def lookup_license(input_video: str) -> dict[str, str]:
    unknown = {"license": "unknown", "license_url": "", "author": "unknown"}

    if not SOURCES_PATH.exists() or not input_video:
        return unknown

    basename = Path(input_video).name.lower()
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))

    for source in sources.values():
        if Path(source.get("download_url", "")).name.lower() == basename:
            return {
                "license": source.get("license", "unknown"),
                "license_url": source.get("license_url", ""),
                "author": source.get("author", "unknown"),
            }

    return unknown


if __name__ == "__main__":
    main()
