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
