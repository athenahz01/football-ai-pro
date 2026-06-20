from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cv.detect import (
    TARGET_CLASS_ALIASES,
    compute_max_video_frames,
    configure_local_runtime_dirs,
    ensure_input_is_allowed,
    parse_target_classes,
)

# Tracking step for the Phase 2 CV foundation. It runs YOLO detection and a
# maintained ByteTrack tracker end to end on a short, rights confirmed clip and
# assigns stable track ids to players and the ball across frames. The tracker is
# Ultralytics' integrated ByteTrack, configured by the bundled bytetrack.yaml. This
# module stays entirely inside cv/. It imports nothing from the product, writes no
# database, and does not touch the grounded answer path. This is tracking only: no
# homography, no pitch coordinates, no metrics, no product integration.

DEFAULT_OUTPUT = Path(__file__).resolve().parent / "output" / "tracks.json"


def main() -> None:
    args = parse_args()
    run_tracking(args)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run YOLO detection and ByteTrack tracking on a rights-safe football clip."
    )
    parser.add_argument("--input", type=Path, required=True, help="Input video path.")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output JSON file for per-object tracks.",
    )
    parser.add_argument(
        "--model",
        default="yolov8n.pt",
        help="Ultralytics YOLO model name or local weights path.",
    )
    parser.add_argument(
        "--tracker",
        default="bytetrack.yaml",
        help="Ultralytics tracker config. Defaults to the bundled ByteTrack.",
    )
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.1,
        help=(
            "Minimum detection confidence floor. Kept low so ByteTrack can use its "
            "low confidence association stage to keep the small, faint ball tracked."
        ),
    )
    parser.add_argument(
        "--max-seconds",
        type=float,
        default=5.0,
        help="Maximum clip duration to process.",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=None,
        help="Optional hard cap on processed frames.",
    )
    parser.add_argument(
        "--target-classes",
        default="person,sports ball",
        help="Comma separated YOLO class names to track.",
    )
    parser.add_argument(
        "--rights-confirmed",
        action="store_true",
        help=(
            "Required acknowledgement that the input is openly licensed or its rights were confirmed by Athena Huo."
        ),
    )
    return parser.parse_args()


def run_tracking(args: argparse.Namespace) -> None:
    if not args.rights_confirmed:
        raise SystemExit(
            "Refusing to process video until --rights-confirmed is set. Use only openly licensed clips or video rights confirmed by Athena Huo."
        )

    ensure_input_is_allowed(args.input)
    cv2, yolo_class = load_dependencies()
    fps, width, height, total_frames = read_video_metadata(cv2, args.input)
    max_video_frames = compute_max_video_frames(fps, args.max_seconds, args.max_frames)

    model = yolo_class(args.model)
    target_classes = parse_target_classes(args.target_classes)
    class_ids = resolve_class_ids(model.names, target_classes)

    # tracks maps a stable track id to its ordered trajectory of per-frame points.
    tracks: dict[int, list[dict[str, Any]]] = defaultdict(list)
    track_classes: dict[int, list[str]] = defaultdict(list)
    processed_frames = 0

    results = model.track(
        source=str(args.input),
        stream=True,
        tracker=args.tracker,
        conf=args.confidence,
        classes=class_ids,
        persist=True,
        verbose=False,
    )

    for frame_index, result in enumerate(results):
        if max_video_frames is not None and frame_index >= max_video_frames:
            break

        processed_frames += 1
        record_frame_tracks(
            result=result,
            frame_index=frame_index,
            fps=fps,
            tracks=tracks,
            track_classes=track_classes,
        )

    output = build_output(
        args=args,
        fps=fps,
        width=width,
        height=height,
        total_frames=total_frames,
        processed_frames=processed_frames,
        target_classes=target_classes,
        tracks=tracks,
        track_classes=track_classes,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print_summary(args.output, output)


def load_dependencies() -> tuple[Any, Any]:
    configure_local_runtime_dirs()

    try:
        import cv2
        from ultralytics import YOLO
    except ImportError as error:
        raise SystemExit(
            "Missing CV dependencies. Install them with: python -m pip install -r cv/requirements.txt"
        ) from error

    return cv2, YOLO


def read_video_metadata(cv2: Any, input_path: Path) -> tuple[float, int, int, int]:
    capture = cv2.VideoCapture(str(input_path))

    if not capture.isOpened():
        raise SystemExit(f"Could not open input video: {input_path}")

    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    finally:
        capture.release()

    return fps, width, height, total_frames


def resolve_class_ids(names: dict[int, str], target_classes: set[str]) -> list[int]:
    name_to_id = {name: class_id for class_id, name in names.items()}
    class_ids = [name_to_id[name] for name in target_classes if name in name_to_id]

    if not class_ids:
        raise SystemExit(
            "None of the target classes were found in the model. "
            f"Model classes include: {sorted(names.values())[:10]}"
        )

    return sorted(class_ids)


def record_frame_tracks(
    result: Any,
    frame_index: int,
    fps: float,
    tracks: dict[int, list[dict[str, Any]]],
    track_classes: dict[int, list[str]],
) -> None:
    boxes = result.boxes

    # ByteTrack only assigns an id once a track is confirmed, so boxes.id is None
    # on frames with no confirmed track yet. Those detections carry no stable id and
    # are simply not recorded.
    if boxes is None or boxes.id is None:
        return

    time_seconds = frame_index / fps if fps > 0 else None

    for index in range(len(boxes)):
        track_id = int(boxes.id[index].item())
        class_id = int(boxes.cls[index].item())
        model_class = result.names[class_id]
        neutral_class = TARGET_CLASS_ALIASES.get(model_class, model_class)
        x1, y1, x2, y2 = [float(value) for value in boxes.xyxy[index].tolist()]

        tracks[track_id].append(
            {
                "frame_index": frame_index,
                "time_seconds": time_seconds,
                "confidence": float(boxes.conf[index].item()),
                "bbox_xyxy": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "center": {"x": (x1 + x2) / 2.0, "y": (y1 + y2) / 2.0},
            }
        )
        track_classes[track_id].append(neutral_class)


def build_output(
    args: argparse.Namespace,
    fps: float,
    width: int,
    height: int,
    total_frames: int,
    processed_frames: int,
    target_classes: set[str],
    tracks: dict[int, list[dict[str, Any]]],
    track_classes: dict[int, list[str]],
) -> dict[str, Any]:
    track_list: list[dict[str, Any]] = []

    for track_id in sorted(tracks):
        trajectory = tracks[track_id]
        neutral_class = Counter(track_classes[track_id]).most_common(1)[0][0]
        track_list.append(
            {
                "track_id": track_id,
                "class": neutral_class,
                "frame_count": len(trajectory),
                "first_frame": trajectory[0]["frame_index"],
                "last_frame": trajectory[-1]["frame_index"],
                "trajectory": trajectory,
            }
        )

    player_tracks = sum(1 for track in track_list if track["class"] == "player")
    ball_tracks = sum(1 for track in track_list if track["class"] == "ball")

    return {
        "metadata": {
            "generated_at": datetime.now(UTC).isoformat(),
            "input_video": str(args.input),
            "model": str(args.model),
            "tracker": str(args.tracker),
            "target_classes": sorted(target_classes),
            "confidence_floor": args.confidence,
            "max_seconds": args.max_seconds,
            "max_frames": args.max_frames,
            "fps": fps,
            "width": width,
            "height": height,
            "video_frame_count": total_frames,
            "processed_frames": processed_frames,
            "track_count": len(track_list),
            "player_track_count": player_tracks,
            "ball_track_count": ball_tracks,
            "rights_confirmed": args.rights_confirmed,
            "legal_gate": (
                "Only openly licensed clips or video rights confirmed by Athena Huo may be processed."
            ),
        },
        "tracks": track_list,
    }


def print_summary(output_path: Path, output: dict[str, Any]) -> None:
    metadata = output["metadata"]
    print(
        f"Wrote {metadata['track_count']} tracks "
        f"({metadata['player_track_count']} player, {metadata['ball_track_count']} ball) "
        f"across {metadata['processed_frames']} frames to {output_path}"
    )


if __name__ == "__main__":
    main()
