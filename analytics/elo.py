"""Elo ratings built from match results in chronological order.

Elo is a self-correcting rating. Each team starts at a base rating. After every
match the winner takes rating points from the loser, scaled by how surprising the
result was and by the margin of victory. Ratings are updated by walking forward
through matches in date order, so a team rating only ever reflects matches that
came before it. No rating is invented by a language model. The output feeds the
Dixon-Coles scoreline model and is stored in team_ratings.

Penalty shootouts are not modeled. A match that is level after regulation and
extra time counts as a draw, which matches how scores are stored in this database.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd


@dataclass(frozen=True)
class EloConfig:
    base_rating: float = 1500.0
    k_factor: float = 40.0
    home_advantage: float = 55.0
    # Rating span where a 10x change in expected score maps to this many points.
    # 400 is the standard Elo scale.
    scale: float = 400.0


def result_scores(home_goals: int, away_goals: int) -> tuple[float, float]:
    """Return the Elo result for the home and away team as 1, 0.5, or 0."""

    if home_goals > away_goals:
        return 1.0, 0.0
    if home_goals < away_goals:
        return 0.0, 1.0
    return 0.5, 0.5


def goal_difference_multiplier(home_goals: int, away_goals: int) -> float:
    """Scale the rating change by margin of victory.

    This is the World Football Elo index of goal difference. A one goal win moves
    ratings by the base amount, larger wins move them more but with diminishing
    weight, so a blowout does not swing a rating too far.
    """

    goal_difference = abs(home_goals - away_goals)

    if goal_difference <= 1:
        return 1.0
    if goal_difference == 2:
        return 1.5

    return (11.0 + goal_difference) / 8.0


def expected_score(rating_for: float, rating_against: float, config: EloConfig) -> float:
    """Expected result for the first team, including its home advantage offset."""

    difference = rating_for - rating_against
    return 1.0 / (1.0 + 10.0 ** (-difference / config.scale))


@dataclass
class EloModel:
    """Stateful Elo ratings for a walk-forward pass over matches."""

    config: EloConfig = field(default_factory=EloConfig)
    ratings: dict[str, float] = field(default_factory=dict)
    matches_played: dict[str, int] = field(default_factory=dict)

    def rating(self, team_id: str) -> float:
        return self.ratings.get(team_id, self.config.base_rating)

    def pre_match_ratings(self, home_team_id: str, away_team_id: str) -> tuple[float, float]:
        """Ratings as they stand before a match, the values used to predict it."""

        return self.rating(home_team_id), self.rating(away_team_id)

    def observe(
        self,
        home_team_id: str,
        away_team_id: str,
        home_goals: int,
        away_goals: int,
    ) -> None:
        """Update both team ratings after a match has been played."""

        home_rating, away_rating = self.pre_match_ratings(home_team_id, away_team_id)
        home_expected = expected_score(
            home_rating + self.config.home_advantage,
            away_rating,
            self.config,
        )
        away_expected = 1.0 - home_expected

        home_actual, away_actual = result_scores(home_goals, away_goals)
        multiplier = goal_difference_multiplier(home_goals, away_goals)
        change = self.config.k_factor * multiplier

        self.ratings[home_team_id] = home_rating + change * (home_actual - home_expected)
        self.ratings[away_team_id] = away_rating + change * (away_actual - away_expected)
        self.matches_played[home_team_id] = self.matches_played.get(home_team_id, 0) + 1
        self.matches_played[away_team_id] = self.matches_played.get(away_team_id, 0) + 1


def compute_final_ratings(
    matches: pd.DataFrame,
    config: EloConfig | None = None,
) -> EloModel:
    """Walk forward through all matches and return the final Elo state.

    The matches frame must be ordered chronologically and provide home_team_id,
    away_team_id, home_score, and away_score. Matches without a final score are
    skipped because they cannot update a rating.
    """

    model = EloModel(config=config or EloConfig())

    for row in matches.itertuples(index=False):
        if pd.isna(row.home_score) or pd.isna(row.away_score):
            continue

        model.observe(
            str(row.home_team_id),
            str(row.away_team_id),
            int(row.home_score),
            int(row.away_score),
        )

    return model
