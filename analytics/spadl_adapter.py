from __future__ import annotations

from typing import Any

import pandas as pd
import socceraction.spadl as spadl
import socceraction.spadl.config as spadlconfig

SOURCE_FIELD_LENGTH = 120.0
SOURCE_FIELD_WIDTH = 80.0

SPADL_ACTION_TYPES = {name: index for index, name in enumerate(spadlconfig.actiontypes)}
SPADL_RESULTS = {name: index for index, name in enumerate(spadlconfig.results)}
SPADL_BODYPARTS = {name: index for index, name in enumerate(spadlconfig.bodyparts)}

MOVE_ACTION_TYPES = {"pass", "cross", "dribble"}
SUCCESS_DEFAULT_ACTION_TYPES = MOVE_ACTION_TYPES | {
    "throw_in",
    "freekick_crossed",
    "freekick_short",
    "corner_crossed",
    "corner_short",
    "goalkick",
    "interception",
    "clearance",
}

FAIL_OUTCOMES = {
    "blocked",
    "claim",
    "fail",
    "incomplete",
    "lost",
    "no touch",
    "out",
    "pass offside",
    "saved",
    "saved to post",
    "wayward",
}

SUCCESS_OUTCOMES = {
    "complete",
    "goal",
    "success",
    "success in play",
    "success out",
    "won",
}

OFFSIDE_OUTCOMES = {"offside", "pass offside"}
OWN_GOAL_OUTCOMES = {"own goal"}
YELLOW_CARD_OUTCOMES = {"yellow card", "second yellow"}
RED_CARD_OUTCOMES = {"red card"}

# Event type mapping from neutral event labels into SPADL.
# The neutral schema stores provider labels with original capitalization.
# This adapter is the single translation boundary.
#
# Move actions:
# - Pass maps to pass or cross. The is_cross and pass_type fields distinguish
#   open play crosses from regular passes.
# - Carry maps to dribble.
# - Set-piece passes map to throw_in, goalkick, corner_crossed, corner_short,
#   freekick_crossed, or freekick_short when pass_type supports it.
#
# Other recognized actions:
# - Shot maps to shot, shot_penalty, or shot_freekick using shot_type.
# - Dribble maps to take_on because it represents a player beating an opponent,
#   while Carry is the ball movement event.
# - Duel maps to tackle, Interception maps to interception, Clearance maps to
#   clearance, Goal Keeper maps to keeper_save, and Miscontrol or Dispossessed
#   maps to bad_touch.
#
# Body parts:
# - left_foot and right_foot map to foot_left and foot_right when available.
# - head maps to head, while other and keeper_hands map to other.
#
# Non-action labels:
# - Starts, ends, tactical records, pressure, blocks, injuries, cards, and other
#   records that do not describe a valued on-ball action map to non_action.
TYPE_MAPPING = {
    "pass": "pass",
    "cross": "cross",
    "carry": "dribble",
    "shot": "shot",
    "dribble": "take_on",
    "duel": "tackle",
    "interception": "interception",
    "clearance": "clearance",
    "goal keeper": "keeper_save",
    "miscontrol": "bad_touch",
    "dispossessed": "bad_touch",
    "foul committed": "foul",
    "foul won": "non_action",
    "ball receipt": "non_action",
    "pressure": "non_action",
    "block": "non_action",
    "50/50": "non_action",
    "starting xi": "non_action",
    "half start": "non_action",
    "half end": "non_action",
    "substitution": "non_action",
    "tactical shift": "non_action",
    "injury stoppage": "non_action",
    "bad behaviour": "non_action",
    "player on": "non_action",
    "player off": "non_action",
    "shield": "non_action",
    "error": "non_action",
}


def convert_events_to_spadl(events: pd.DataFrame) -> pd.DataFrame:
    if events.empty:
        return empty_actions()

    actions_by_match = []

    for match_id, match_events in events.groupby("match_id", sort=False):
        converted = convert_match_events_to_spadl(str(match_id), match_events)
        if not converted.empty:
            actions_by_match.append(converted)

    if not actions_by_match:
        return empty_actions()

    return pd.concat(actions_by_match, ignore_index=True)


def convert_match_events_to_spadl(match_id: str, events: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    ordered = events.sort_values(["period", "sequence"])

    for _, event in ordered.iterrows():
        row = convert_event(match_id, event)
        if row is not None:
            rows.append(row)

    if not rows:
        return empty_actions()

    actions = pd.DataFrame(rows)
    actions["action_id"] = range(len(actions))

    home_team_id = ordered["home_team_id"].dropna().iloc[0]
    actions = spadl.play_left_to_right(actions, home_team_id)

    actions.index = range(len(actions))
    return actions


def convert_event(match_id: str, event: pd.Series) -> dict[str, Any] | None:
    start = convert_location(event.get("location_x"), event.get("location_y"))
    if start is None:
        return None

    action_type = map_type(event)
    end = convert_location(event.get("end_location_x"), event.get("end_location_y"))
    if end is None:
        end = start

    result_name = map_result(event.get("outcome"), action_type)
    bodypart_name = map_bodypart(event.get("body_part"))
    period = int(event["period"])
    seconds = float(event["minute"]) * 60.0 + float(event["second"])

    return {
        "game_id": match_id,
        "original_event_id": str(event["event_id"]),
        "action_id": 0,
        "period_id": period,
        "time_seconds": seconds,
        "team_id": nullable_string(event.get("team_id")),
        "player_id": nullable_string(event.get("player_id")),
        "start_x": start[0],
        "start_y": start[1],
        "end_x": end[0],
        "end_y": end[1],
        "bodypart_id": SPADL_BODYPARTS[bodypart_name],
        "type_id": SPADL_ACTION_TYPES[action_type],
        "result_id": SPADL_RESULTS[result_name],
        "type_name": action_type,
        "result_name": result_name,
        "bodypart_name": bodypart_name,
    }


def map_type(event: pd.Series) -> str:
    normalized = normalize_label(event.get("type"))

    if normalized == "pass":
        return map_pass_type(event)

    if normalized == "shot":
        return map_shot_type(event)

    return TYPE_MAPPING.get(normalized, "non_action")


def map_pass_type(event: pd.Series) -> str:
    pass_type = normalize_label(event.get("pass_type"))
    is_cross = nullable_bool(event.get("is_cross")) is True

    if pass_type == "corner":
        return "corner_crossed" if is_cross else "corner_short"

    if pass_type == "free_kick":
        return "freekick_crossed" if is_cross else "freekick_short"

    if pass_type == "throw_in":
        return "throw_in"

    if pass_type == "goal_kick":
        return "goalkick"

    if is_cross:
        return "cross"

    return "pass"


def map_shot_type(event: pd.Series) -> str:
    shot_type = normalize_label(event.get("shot_type"))

    if shot_type == "penalty":
        return "shot_penalty"

    if shot_type == "free_kick":
        return "shot_freekick"

    return "shot"


def map_bodypart(value: Any) -> str:
    normalized = normalize_label(value)

    if normalized == "left_foot" and "foot_left" in SPADL_BODYPARTS:
        return "foot_left"

    if normalized == "right_foot" and "foot_right" in SPADL_BODYPARTS:
        return "foot_right"

    if normalized == "head":
        return "head"

    if normalized in {"other", "keeper_hands"}:
        return "other"

    return "foot"


def map_result(value: Any, action_type: str) -> str:
    normalized = normalize_label(value)

    if normalized in OFFSIDE_OUTCOMES:
        return "offside"

    if normalized in OWN_GOAL_OUTCOMES:
        return "owngoal"

    if normalized in YELLOW_CARD_OUTCOMES:
        return "yellow_card"

    if normalized in RED_CARD_OUTCOMES:
        return "red_card"

    if normalized in FAIL_OUTCOMES:
        return "fail"

    if normalized in SUCCESS_OUTCOMES:
        return "success"

    if action_type in SUCCESS_DEFAULT_ACTION_TYPES:
        return "success"

    if action_type in {"shot", "shot_penalty", "shot_freekick"}:
        return "fail"

    return "success"


def convert_location(x_value: Any, y_value: Any) -> tuple[float, float] | None:
    if pd.isna(x_value) or pd.isna(y_value):
        return None

    # Provider-specific assumption: Phase 0 neutral events store coordinates
    # on a 120 by 80 source pitch with origin at the top left. Convert to
    # SPADL's 105 by 68 pitch with origin at the bottom left.
    x = clamp(float(x_value), 0.0, SOURCE_FIELD_LENGTH)
    y = clamp(float(y_value), 0.0, SOURCE_FIELD_WIDTH)

    spadl_x = x / SOURCE_FIELD_LENGTH * spadlconfig.field_length
    spadl_y = (SOURCE_FIELD_WIDTH - y) / SOURCE_FIELD_WIDTH * spadlconfig.field_width

    return (
        clamp(spadl_x, 0.0, spadlconfig.field_length),
        clamp(spadl_y, 0.0, spadlconfig.field_width),
    )


def normalize_label(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""

    return str(value).replace("*", "").replace("-", " ").strip().lower()


def nullable_string(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None

    return str(value)


def nullable_bool(value: Any) -> bool | None:
    if value is None or pd.isna(value):
        return None

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False

    return bool(value)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def empty_actions() -> pd.DataFrame:
    return pd.DataFrame(
        columns=[
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
    )
