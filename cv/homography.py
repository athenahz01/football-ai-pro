from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Homography machinery for the CV pipeline. A homography maps points from image
# pixels to a known planar surface, here the pitch. Given four or more
# correspondences between image pixels and known pitch positions, it computes the
# transform, and then maps any tracked point from pixels to pitch coordinates.
#
# Honest limitation, stated plainly: real pitch coordinates in meters require a
# calibrated clip, one where known pitch positions, for example the corners of the
# penalty box or the centre circle, are visible so their pixel locations can be
# paired with their real positions on a standard pitch. The current openly licensed
# sample clip is not a calibrated broadcast match view, so no calibration points
# exist for it and metrics on it stay in image pixel units. This module is built
# correctly and generally so that, the moment a calibrated and rights confirmed
# match clip exists, supplying its calibration points produces true meters with no
# code change. This module is pure geometry. It imports nothing from the product
# and touches no database.

# A standard full size pitch is 105 by 68 meters. Calibration pitch positions are
# given in meters in this frame, origin at one corner.
STANDARD_PITCH_LENGTH_M = 105.0
STANDARD_PITCH_WIDTH_M = 68.0


@dataclass(frozen=True)
class Calibration:
    """Pixel to pitch calibration for one clip."""

    homography: np.ndarray
    pitch_units: str

    def map_points(self, points: np.ndarray) -> np.ndarray:
        return apply_homography(self.homography, points)


def compute_homography(
    correspondences: list[tuple[tuple[float, float], tuple[float, float]]],
) -> np.ndarray:
    """Compute the 3x3 homography from pixel points to pitch points.

    correspondences is a list of (pixel_xy, pitch_xy) pairs. At least four are
    required, and no three may be collinear. Uses the Direct Linear Transform with
    an SVD solve, which is the standard exact method for four points and a least
    squares fit for more.
    """

    if len(correspondences) < 4:
        raise ValueError("At least four correspondences are required for a homography.")

    rows: list[list[float]] = []
    for (px, py), (qx, qy) in correspondences:
        rows.append([-px, -py, -1.0, 0.0, 0.0, 0.0, qx * px, qx * py, qx])
        rows.append([0.0, 0.0, 0.0, -px, -py, -1.0, qy * px, qy * py, qy])

    matrix = np.asarray(rows, dtype=float)
    _, _, vh = np.linalg.svd(matrix)
    homography = vh[-1].reshape(3, 3)

    if homography[2, 2] == 0:
        raise ValueError("Degenerate correspondences produced a singular homography.")

    return homography / homography[2, 2]


def apply_homography(homography: np.ndarray, points: np.ndarray) -> np.ndarray:
    """Map an N by 2 array of points through the homography."""

    pts = np.asarray(points, dtype=float).reshape(-1, 2)
    homogeneous = np.column_stack([pts, np.ones(len(pts))])
    projected = homogeneous @ homography.T
    scale = projected[:, 2:3]

    if np.any(scale == 0):
        raise ValueError("A point mapped to infinity under the homography.")

    return projected[:, :2] / scale


def load_calibration(path: Path) -> Calibration:
    """Load calibration points for a clip and build the homography.

    The calibration file is JSON of the shape:
        {
          "pitch_units": "meters",
          "correspondences": [
            {"pixel": [x, y], "pitch": [X, Y]},
            ... at least four ...
          ]
        }
    """

    data = json.loads(Path(path).read_text(encoding="utf-8"))
    pitch_units = data.get("pitch_units", "meters")
    correspondences = [
        ((entry["pixel"][0], entry["pixel"][1]), (entry["pitch"][0], entry["pitch"][1]))
        for entry in data["correspondences"]
    ]

    return Calibration(
        homography=compute_homography(correspondences),
        pitch_units=pitch_units,
    )
