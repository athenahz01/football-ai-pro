from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from socceraction.vaep import features as vaep_features
from socceraction.vaep import formula as vaep_formula
from socceraction.vaep import labels as vaep_labels

RANDOM_SEED = 42
NB_PREV_ACTIONS = 3
SPADL_COLUMNS = [
    "game_id",
    "original_event_id",
    "action_id",
    "period_id",
    "time_seconds",
    "team_id",
    "player_id",
    "start_x",
    "start_y",
    "end_x",
    "end_y",
    "bodypart_id",
    "type_id",
    "result_id",
    "type_name",
    "result_name",
    "bodypart_name",
]

# This is a prototype scale VAEP model trained on the loaded Phase 0 matches.
# It is deterministic, but it is not a production model.
FEATURE_FUNCTIONS = [
    vaep_features.actiontype_onehot,
    vaep_features.result_onehot,
    vaep_features.actiontype_result_onehot,
    vaep_features.bodypart_onehot,
    vaep_features.time,
    vaep_features.startlocation,
    vaep_features.endlocation,
    vaep_features.startpolar,
    vaep_features.endpolar,
    vaep_features.movement,
    vaep_features.time_delta,
    vaep_features.space_delta,
    vaep_features.goalscore,
]


def add_vaep_values(actions: pd.DataFrame) -> pd.DataFrame:
    valued_actions = actions.copy()

    for column in ["vaep_offensive", "vaep_defensive", "vaep_value"]:
        valued_actions[column] = None

    if valued_actions.empty:
        return valued_actions

    np.random.seed(RANDOM_SEED)

    valued_actions["_input_order"] = range(len(valued_actions))
    ordered_actions = valued_actions.sort_values(
        ["game_id", "period_id", "action_id"],
    ).copy()
    spadl_actions = ordered_actions[SPADL_COLUMNS].copy()

    feature_frame = compute_feature_frame(spadl_actions)
    labels = compute_label_frame(spadl_actions)
    score_probabilities = predict_probabilities(feature_frame, labels["scores"])
    concede_probabilities = predict_probabilities(feature_frame, labels["concedes"])
    vaep_values = compute_vaep_frame(
        spadl_actions,
        score_probabilities,
        concede_probabilities,
    )

    ordered_actions["vaep_offensive"] = vaep_values["offensive_value"].astype(float)
    ordered_actions["vaep_defensive"] = vaep_values["defensive_value"].astype(float)
    ordered_actions["vaep_value"] = vaep_values["vaep_value"].astype(float)

    result = ordered_actions.sort_values("_input_order").copy()
    del result["_input_order"]
    return result


def compute_feature_frame(actions: pd.DataFrame) -> pd.DataFrame:
    game_states = vaep_features.gamestates(actions, NB_PREV_ACTIONS)
    feature_frame = pd.concat(
        [feature_function(game_states) for feature_function in FEATURE_FUNCTIONS],
        axis=1,
    )
    feature_frame = pd.get_dummies(feature_frame, dummy_na=True)
    feature_frame = feature_frame.replace([np.inf, -np.inf], np.nan)
    return feature_frame.fillna(0.0)


def compute_label_frame(actions: pd.DataFrame) -> pd.DataFrame:
    labels_by_match = []

    for _, match_actions in actions.groupby("game_id", sort=False):
        labels_by_match.append(
            pd.concat(
                [
                    vaep_labels.scores(match_actions),
                    vaep_labels.concedes(match_actions),
                ],
                axis=1,
            )
        )

    label_frame = pd.concat(labels_by_match).sort_index()
    return label_frame.astype(int)


def compute_vaep_frame(
    actions: pd.DataFrame,
    score_probabilities: pd.Series,
    concede_probabilities: pd.Series,
) -> pd.DataFrame:
    values_by_match = []

    for _, match_actions in actions.groupby("game_id", sort=False):
        values_by_match.append(
            vaep_formula.value(
                match_actions,
                score_probabilities.loc[match_actions.index],
                concede_probabilities.loc[match_actions.index],
            )
        )

    return pd.concat(values_by_match).sort_index()


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
