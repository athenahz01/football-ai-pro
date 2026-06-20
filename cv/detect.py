from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

TARGET_CLASS_ALIASES = {
    "person": "player",
    "sports ball": "ball",
}

DEFAULT_OUTPUT = Path(__file__).resolve().parent / "output" / "detections.json"


def main() -> None:
    args = parse_args()
    run_detection(args)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run YOLO player and ball detection on a rights-safe football clip."
    )
    parser.add_argument("--input", type=Path, required=True, help="Input video path.")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output JSON file for per-frame detections.",
    )
    parser.add_argument(
        "--model",
        default="yolov8n.pt",
        help="Ultralytics YOLO model name or local weights path.",
    )
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.25,
        help="Minimum detection confidence.",
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
        help="Optional hard cap on decoded frames.",
    )
    parser.add_argument(
        "--frame-stride",
        type=int,
        default=1,
        help="Process every Nth frame.",
    )
    parser.add_argument(
        "--target-classes",
        default="person,sports ball",
        help="Comma separated YOLO class names to keep.",
    )
    parser.add_argument(
        "--rights-confirmed",
        action="store_true",
        help=(
            "Required acknowledgement that the input is openly licensed or its rights were confirmed by Athena Huo."
        ),
    )
    return parser.parse_args()


def run_detection(args: argparse.Namespace) -> None:
    if not args.rights_confirmed:
        raise SystemExit(
            "Refusing to process video until --rights-confirmed is set. Use only openly licensed clips or video rights confirmed by Athena Huo."
        )

    ensure_input_is_allowed(args.input)
    cv2, yolo_class = load_dependencies()
    model = yolo_class(args.model)
    target_classes = parse_target_classes(args.target_classes)
    capture = cv2.VideoCapture(str(args.input))

    if not capture.isOpened():
        raise SystemExit(f"Could not open input video: {args.input}")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    max_video_frames = compute_max_video_frames(fps, args.max_seconds, args.max_frames)
    frames: list[dict[str, Any]] = []
    frame_index = 0

    try:
        while True:
            if max_video_frames is not None and frame_index >= max_video_frames:
                break

            ok, frame = capture.read()
            if not ok:
                break

            if frame_index % args.frame_stride == 0:
                frames.append(
                    detect_frame(
                        model=model,
                        frame=frame,
                        frame_index=frame_index,
                        fps=fps,
                        target_classes=target_classes,
                        confidence=args.confidence,
                    )
                )

            frame_index += 1
    finally:
        capture.release()

    output = {
        "metadata": {
            "generated_at": datetime.now(UTC).isoformat(),
            "input_video": str(args.input),
            "model": str(args.model),
            "target_classes": sorted(target_classes),
            "confidence_threshold": args.confidence,
            "max_seconds": args.max_seconds,
            "max_frames": args.max_frames,
            "frame_stride": args.frame_stride,
            "fps": fps,
            "width": width,
            "height": height,
            "video_frame_count": total_frames,
            "decoded_frames_seen": frame_index,
            "processed_frames": len(frames),
            "rights_confirmed": args.rights_confirmed,
            "legal_gate": (
                "Only openly licensed clips or video rights confirmed by Athena Huo may be processed."
            ),
        },
        "frames": frames,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(
        f"Wrote {sum(len(frame['detections']) for frame in frames)} detections across {len(frames)} frames to {args.output}"
    )


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


def configure_local_runtime_dirs() -> None:
    cv_dir = Path(__file__).resolve().parent
    yolo_config_dir = cv_dir / ".ultralytics"
    matplotlib_config_dir = cv_dir / ".matplotlib"

    yolo_config_dir.mkdir(parents=True, exist_ok=True)
    matplotlib_config_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("YOLO_CONFIG_DIR", str(yolo_config_dir))
    os.environ.setdefault("MPLCONFIGDIR", str(matplotlib_config_dir))


def ensure_input_is_allowed(input_path: Path) -> None:
    if not input_path.exists():
        raise SystemExit(f"Input video does not exist: {input_path}")


def parse_target_classes(value: str) -> set[str]:
    classes = {entry.strip() for entry in value.split(",") if entry.strip()}

    if not classes:
        raise SystemExit("At least one target class is required.")

    return classes


def compute_max_video_frames(
    fps: float,
    max_seconds: float | None,
    max_frames: int | None,
) -> int | None:
    caps = []

    if max_seconds is not None and max_seconds > 0 and fps > 0:
        caps.append(int(max_seconds * fps))

    if max_frames is not None and max_frames > 0:
        caps.append(max_frames)

    return min(caps) if caps else None


def detect_frame(
    model: Any,
    frame: Any,
    frame_index: int,
    fps: float,
    target_classes: set[str],
    confidence: float,
) -> dict[str, Any]:
    result = model.predict(frame, conf=confidence, verbose=False)[0]
    detections = []

    for box in result.boxes:
        class_id = int(box.cls[0].item())
        model_class_name = result.names[class_id]

        if model_class_name not in target_classes:
            continue

        x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
        detection = {
            "class": TARGET_CLASS_ALIASES.get(model_class_name, model_class_name),
            "model_class": model_class_name,
            "class_id": class_id,
            "confidence": float(box.conf[0].item()),
            "bbox_xyxy": {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
            },
        }
        detections.append(detection)

    return {
        "frame_index": frame_index,
        "time_seconds": frame_index / fps if fps > 0 else None,
        "detections": detections,
    }


if __name__ == "__main__":
    main()
