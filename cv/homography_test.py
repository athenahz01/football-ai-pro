from __future__ import annotations

import unittest

import numpy as np

from cv.homography import apply_homography, compute_homography, load_calibration


class HomographyTest(unittest.TestCase):
    def test_recovers_a_known_perspective_transform(self) -> None:
        # A known, non-affine homography to recover from synthetic correspondences.
        known = np.array(
            [
                [1.2, 0.15, 30.0],
                [0.1, 1.05, 20.0],
                [0.0004, 0.0002, 1.0],
            ]
        )
        source = np.array(
            [[10.0, 10.0], [200.0, 15.0], [205.0, 180.0], [12.0, 175.0], [100.0, 90.0]]
        )
        target = apply_homography(known, source)

        correspondences = [
            ((float(s[0]), float(s[1])), (float(t[0]), float(t[1])))
            for s, t in zip(source, target)
        ]
        recovered = compute_homography(correspondences)

        check_points = np.array([[50.0, 60.0], [150.0, 120.0], [180.0, 40.0]])
        expected = apply_homography(known, check_points)
        actual = apply_homography(recovered, check_points)

        np.testing.assert_allclose(actual, expected, atol=1e-6)

    def test_maps_pitch_corners_to_meters(self) -> None:
        # Four image corners paired with the four pitch corners in meters, then the
        # image centre should map to the pitch centre at 52.5 by 34.
        correspondences = [
            ((100.0, 500.0), (0.0, 0.0)),
            ((1180.0, 500.0), (105.0, 0.0)),
            ((1180.0, 100.0), (105.0, 68.0)),
            ((100.0, 100.0), (0.0, 68.0)),
        ]
        homography = compute_homography(correspondences)
        centre = apply_homography(homography, np.array([[640.0, 300.0]]))[0]

        self.assertAlmostEqual(centre[0], 52.5, delta=0.5)
        self.assertAlmostEqual(centre[1], 34.0, delta=0.5)

    def test_requires_at_least_four_points(self) -> None:
        with self.assertRaises(ValueError):
            compute_homography([((0.0, 0.0), (0.0, 0.0)), ((1.0, 1.0), (1.0, 1.0))])

    def test_load_calibration_round_trip(self) -> None:
        import json
        import tempfile
        from pathlib import Path

        payload = {
            "pitch_units": "meters",
            "correspondences": [
                {"pixel": [100, 500], "pitch": [0, 0]},
                {"pixel": [1180, 500], "pitch": [105, 0]},
                {"pixel": [1180, 100], "pitch": [105, 68]},
                {"pixel": [100, 100], "pitch": [0, 68]},
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "calibration.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            calibration = load_calibration(path)

        self.assertEqual(calibration.pitch_units, "meters")
        centre = calibration.map_points(np.array([[640.0, 300.0]]))[0]
        self.assertAlmostEqual(centre[0], 52.5, delta=0.5)


if __name__ == "__main__":
    unittest.main()
