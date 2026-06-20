# Football AI Pro CV foundation

This module is the Phase 2 computer vision foundation. It is intentionally isolated from the Next.js app, analytics code, database, and product API. It only downloads an openly licensed sample football clip and runs YOLO detection for players and the ball on a short bounded segment.

No tracking, homography, pitch coordinates, metrics, database writes, or product integration are included in this task.

## Legal gate

Process only openly licensed clips or videos whose rights have been confirmed by Athena Huo for this specific use. Do not process copyrighted broadcast footage unless Athena Huo has confirmed the rights to that exact video.

The bundled sample downloader uses:

- Title: `Football Tennis`
- Source page: `https://commons.wikimedia.org/wiki/File:Football_Tennis.webm`
- Direct media URL: `https://upload.wikimedia.org/wikipedia/commons/8/87/Football_Tennis.webm`
- Author: `PK17 Football (PredatorKnuckles17) UK HD`
- Credit: YouTube, cut from 0:42 to 4:03
- License: `CC BY 3.0`
- License URL: `https://creativecommons.org/licenses/by/3.0/`

This source and license are also recorded in `cv/sample_sources.json`.

## Setup

From the repo root:

```powershell
py -3.12 -m venv cv\.venv
cv\.venv\Scripts\python -m pip install --upgrade pip
cv\.venv\Scripts\python -m pip install -r cv\requirements.txt
```

Use Python 3.11 or newer. The CV requirements are separate from `analytics/` and the app dependencies so this module can later move to a GPU service such as Railway or Modal.

## Download the sample clip

```powershell
cv\.venv\Scripts\python -m cv.download_sample
```

The clip is saved to `cv/samples/football_tennis.webm`. The `cv/samples/` directory is ignored by git.

## Run detection

```powershell
cv\.venv\Scripts\python -m cv.detect --input cv\samples\football_tennis.webm --output cv\output\football_tennis.detections.json --model yolov8n.pt --max-seconds 3 --max-frames 30 --confidence 0.25 --rights-confirmed
```

`yolov8n.pt` is the default pretrained Ultralytics YOLO model. It detects COCO `person` as `player` and COCO `sports ball` as `ball`. On the documented `Football Tennis` sample, the proof run detected players and the ball across 30 processed frames.

The model, input clip, output path, confidence threshold, maximum seconds, maximum frames, frame stride, and target classes are configurable. The `--rights-confirmed` flag is required so a developer must explicitly confirm that the clip is openly licensed or rights confirmed before processing.

Proof run on the documented sample: 30 processed frames, 95 detections, 65 player detections, and 30 ball detections.

## Output schema

The output is a local JSON file:

```json
{
  "metadata": {
    "input_video": "cv/samples/football_tennis.webm",
    "model": "yolov8n.pt",
    "processed_frames": 30,
    "rights_confirmed": true
  },
  "frames": [
    {
      "frame_index": 0,
      "time_seconds": 0.0,
      "detections": [
        {
          "class": "player",
          "model_class": "person",
          "class_id": 0,
          "confidence": 0.91,
          "bbox_xyxy": {
            "x1": 10.0,
            "y1": 20.0,
            "x2": 80.0,
            "y2": 180.0
          }
        }
      ]
    }
  ]
}
```

Detection output is written under `cv/output/` by default, which is ignored by git.

## Run tracking

Tracking turns the per frame detections into consistent tracks across frames. It
runs detection and tracking end to end on the clip and assigns stable track ids to
players and the ball. The tracker is Ultralytics' integrated ByteTrack, a
maintained implementation, configured by the bundled `bytetrack.yaml`. ByteTrack
needs a linear assignment solver, provided by `lapx` in `cv/requirements.txt`.

```powershell
cv\.venv\Scripts\python -m cv.track --input cv\samples\football_tennis.webm --output cv\output\football_tennis.tracks.json --max-seconds 3 --rights-confirmed
```

Like detection, the `--rights-confirmed` flag is required, so tracking refuses to
run on unconfirmed video. The confidence floor defaults to a low 0.1 so ByteTrack
can use its low confidence association stage to keep the small, faint ball tracked
across frames. Tracking processes consecutive frames, not a stride, because the
tracker relies on frame to frame continuity.

Proof run on the documented `Football Tennis` CC BY 3.0 sample, bounded to 3
seconds: 72 processed frames at 24 fps produced 4 tracks, 3 players and 1 ball. The
two main players each kept the same id across all 72 frames, and the ball kept a
single id across all 72 frames.

### Tracking output schema

The output is a local JSON file under `cv/output/`, which is ignored by git. It is
organized per track rather than per frame:

```json
{
  "metadata": {
    "input_video": "cv/samples/football_tennis.webm",
    "model": "yolov8n.pt",
    "tracker": "bytetrack.yaml",
    "processed_frames": 72,
    "track_count": 4,
    "player_track_count": 3,
    "ball_track_count": 1,
    "rights_confirmed": true
  },
  "tracks": [
    {
      "track_id": 1,
      "class": "player",
      "frame_count": 72,
      "first_frame": 0,
      "last_frame": 71,
      "trajectory": [
        {
          "frame_index": 0,
          "time_seconds": 0.0,
          "confidence": 0.91,
          "bbox_xyxy": { "x1": 10.0, "y1": 20.0, "x2": 80.0, "y2": 180.0 },
          "center": { "x": 45.0, "y": 100.0 }
        }
      ]
    }
  ]
}
```

## Homography and movement metrics

`cv/homography.py` computes the transform from image pixels to pitch coordinates
from four or more correspondences between pixels and known pitch positions, and
maps any track point through it. It is unit tested on synthetic correspondences:

```powershell
cv\.venv\Scripts\python -m unittest cv.homography_test
```

Honest limitation: real pitch coordinates in meters need a calibrated clip, one
where known pitch positions are visible so their pixel locations can be paired with
their real positions. The current openly licensed sample is not a calibrated
broadcast match view, so it has no calibration points and its metrics stay in image
pixels. The machinery is general, so supplying a calibration file for a future
calibrated, rights confirmed clip produces true meters with no code change.

`cv/metrics.py` derives per track movement metrics from the tracks: total distance,
top speed, average speed, and time tracked. With a calibration the metrics are in
meters; without one they are in pixels, and the units are labelled explicitly and
never relabelled as meters.

```powershell
cv\.venv\Scripts\python -m cv.metrics --tracks cv\output\football_tennis.tracks.json --output cv\output\football_tennis.metrics.json
```

On the sample clip, with no calibration, this writes pixel units. The metrics file
records the license and that the metrics are in pixels.

## Materializing the broadcast_cv source

The CV module stays free of the database. A loader in the analytics layer reads the
metrics file and writes it into the product as a third labelled source,
`broadcast_cv`, through the trusted analytics write path, never model SQL:

```powershell
.venv\Scripts\python -m analytics.load_cv_metrics --metrics cv\output\football_tennis.metrics.json
```

It namespaces clip and track ids with a `cv:` prefix and labels the rows `source`
`broadcast_cv`, mirroring how StatsBomb and API-Football are labelled. The metrics
are per anonymous track, not per identified player. The loader refuses to load
metrics that were not derived from a rights confirmed clip, so the legal gate
carries all the way through.
