from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

RANDOM_SEED = 42
FIELD_LENGTH = 105.0
FIELD_WIDTH = 68.0
GOAL_WIDTH = 7.32
SHOT_ACTION_TYPES = {"shot", "shot_penalty", "shot_freekick"}

# Prototype open xG model trained only on loaded shots.
# Features are shot distance, shot angle, SPADL body part, and SPADL shot type.
# No provider supplied expected goal value is used.


def compute_shot_xg(actions: pd.DataFrame) -> pd.DataFrame:
    shots = actions[actions["type_name"].isin(SHOT_ACTION_TYPES)].copy()

    if shots.empty:
        shots["xg"] = []
        return shots

    np.random.seed(RANDOM_SEED)
    features = build_feature_frame(shots)
    labels = (shots["result_name"] == "success").astype(int)
    shots["xg"] = predict_probabilities(features, labels)
    return shots


def build_feature_frame(shots: pd.DataFrame) -> pd.DataFrame:
    distance, angle = shot_geometry(shots["start_x"], shots["start_y"])

    return pd.DataFrame(
        {
            "distance": distance,
            "angle": angle,
            "is_head": (shots["bodypart_name"] == "head").astype(int),
            "is_left_foot": (shots["bodypart_name"] == "foot_left").astype(int),
            "is_right_foot": (shots["bodypart_name"] == "foot_right").astype(int),
            "is_other_body_part": (shots["bodypart_name"] == "other").astype(int),
            "is_penalty": (shots["type_name"] == "shot_penalty").astype(int),
            "is_free_kick": (shots["type_name"] == "shot_freekick").astype(int),
        },
        index=shots.index,
    )


def shot_geometry(
    start_x: pd.Series,
    start_y: pd.Series,
) -> tuple[pd.Series, pd.Series]:
    goal_x = FIELD_LENGTH
    goal_y = FIELD_WIDTH / 2.0
    left_post_y = goal_y - GOAL_WIDTH / 2.0
    right_post_y = goal_y + GOAL_WIDTH / 2.0

    dx = goal_x - start_x.astype(float)
    dy = goal_y - start_y.astype(float)
    distance = np.sqrt(dx.pow(2) + dy.pow(2))

    left_distance = np.sqrt(dx.pow(2) + (left_post_y - start_y.astype(float)).pow(2))
    right_distance = np.sqrt(dx.pow(2) + (right_post_y - start_y.astype(float)).pow(2))
    denominator = 2.0 * left_distance * right_distance
    cosine = (
        left_distance.pow(2)
        + right_distance.pow(2)
        - GOAL_WIDTH**2
    ) / denominator.replace(0.0, np.nan)
    angle = np.arccos(np.clip(cosine.fillna(1.0), -1.0, 1.0))

    return distance, pd.Series(angle, index=start_y.index)


def predict_probabilities(features: pd.DataFrame, labels: pd.Series) -> pd.Series:
    if labels.nunique() < 2:
        return pd.Series(float(labels.iloc[0]), index=features.index)

    model = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value=0.0)),
            ("scaler", StandardScaler()),
            (
                "model",
                LogisticRegression(
                    max_iter=1_000,
                    random_state=RANDOM_SEED,
                    solver="lbfgs",
                ),
            ),
        ],
    )
    model.fit(features, labels)
    probabilities = model.predict_proba(features)[:, 1]
    return pd.Series(probabilities, index=features.index)
