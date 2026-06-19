"""Monte Carlo simulation for multi match and knockout questions.

A single match has a closed form three way probability from the Dixon-Coles
scoreline matrix, so it needs no simulation. Questions that chain several matches,
such as the chance a team wins a knockout bracket, do not have a simple closed
form, so we sample many scorelines and count how often each outcome happens.

Sampling draws exact scorelines from the same Dixon-Coles matrix the analytic
model uses, so the two agree in the limit. A knockout tie that is level after
extra time is decided by a coin flip, which stands in for a penalty shootout that
the scoring model does not attempt to predict.

The simulation is seeded so a given input always produces the same output. No
probability here comes from a language model.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from analytics.dixon_coles import scoreline_matrix


@dataclass(frozen=True)
class ThreeWayProbabilities:
    prob_home_win: float
    prob_draw: float
    prob_away_win: float


def sample_scorelines(
    lambda_home: float,
    lambda_away: float,
    rho: float,
    n_sims: int,
    seed: int,
    max_goals: int = 10,
) -> np.ndarray:
    """Draw n_sims exact scorelines as an array of shape (n_sims, 2)."""

    matrix = scoreline_matrix(lambda_home, lambda_away, rho, max_goals)
    flat = matrix.ravel()
    flat = flat / flat.sum()

    rng = np.random.default_rng(seed)
    draws = rng.choice(flat.size, size=n_sims, p=flat)
    home_goals, away_goals = np.divmod(draws, max_goals + 1)

    return np.column_stack([home_goals, away_goals])


def simulate_three_way(
    lambda_home: float,
    lambda_away: float,
    rho: float,
    n_sims: int,
    seed: int,
    max_goals: int = 10,
) -> ThreeWayProbabilities:
    """Estimate three way probabilities by sampling, for cross checking the model."""

    scorelines = sample_scorelines(lambda_home, lambda_away, rho, n_sims, seed, max_goals)
    home = scorelines[:, 0]
    away = scorelines[:, 1]
    total = float(n_sims)

    return ThreeWayProbabilities(
        prob_home_win=float(np.sum(home > away)) / total,
        prob_draw=float(np.sum(home == away)) / total,
        prob_away_win=float(np.sum(home < away)) / total,
    )


def simulate_knockout_bracket(
    pairings: list[tuple[str, str]],
    neutral_three_way: dict[tuple[str, str], ThreeWayProbabilities],
    n_sims: int,
    seed: int,
) -> dict[str, float]:
    """Estimate each team's probability of winning a single elimination bracket.

    pairings is the ordered list of first round matches. The winner of pairing i
    meets the winner of pairing i+1 in the next round, the standard bracket layout.
    neutral_three_way maps an unordered pair to its three way probabilities. A draw
    is resolved by a coin flip to stand in for a penalty shootout.
    """

    rng = np.random.default_rng(seed)
    title_counts: dict[str, int] = {}

    for _ in range(n_sims):
        round_teams = [_play(pair[0], pair[1], neutral_three_way, rng) for pair in pairings]

        while len(round_teams) > 1:
            round_teams = [
                _play(round_teams[i], round_teams[i + 1], neutral_three_way, rng)
                for i in range(0, len(round_teams), 2)
            ]

        champion = round_teams[0]
        title_counts[champion] = title_counts.get(champion, 0) + 1

    return {team: count / n_sims for team, count in title_counts.items()}


def _play(
    team_a: str,
    team_b: str,
    neutral_three_way: dict[tuple[str, str], ThreeWayProbabilities],
    rng: np.random.Generator,
) -> str:
    probabilities = neutral_three_way.get((team_a, team_b))
    flip = False

    if probabilities is None:
        probabilities = neutral_three_way.get((team_b, team_a))
        flip = True

    if probabilities is None:
        raise KeyError(f"No probabilities supplied for {team_a} versus {team_b}.")

    prob_a = probabilities.prob_away_win if flip else probabilities.prob_home_win
    prob_b = probabilities.prob_home_win if flip else probabilities.prob_away_win

    draw = rng.random()
    if draw < prob_a:
        return team_a
    if draw < prob_a + prob_b:
        return team_b

    # Level after extra time, decided by a coin flip in place of a shootout.
    return team_a if rng.random() < 0.5 else team_b
