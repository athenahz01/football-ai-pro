"""Dixon-Coles Poisson scoreline model, chained with Elo.

The model treats home and away goals as Poisson counts driven by each team's
attacking and defending strength plus a home advantage, with the Dixon-Coles
correction that lifts the probability of the low scoring results 0-0, 1-0, 0-1,
and 1-1 where an independent Poisson is known to be wrong. Fitting is maximum
likelihood on the matches that came before the target match, so a prediction only
ever uses earlier results.

Strengths are regularized toward an average team. On a single tournament with few
matches per team this keeps the fit stable and honest rather than overconfident.
When too few earlier matches exist to trust the fit, the prediction leans on the
Elo rating difference instead. This is the Elo into Dixon-Coles chain: Elo carries
the prior, Dixon-Coles refines it as real scoring data accumulates.

Every output here is a deterministic function of stored match results and the Elo
ratings. No probability is produced by a language model.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import gammaln


@dataclass(frozen=True)
class DixonColesConfig:
    max_goals: int = 10
    # Strong shrinkage toward an average team. On a single tournament with few
    # matches per team this keeps strengths interpretable and predictions honest
    # rather than overfit to one good or bad result.
    ridge: float = 0.5
    # Below this many earlier matches, the fit is skipped and Elo carries the
    # prediction on its own.
    min_fit_matches: int = 8
    # At this many earlier matches the Dixon-Coles fit is fully trusted. Between
    # min_fit_matches and this value the prediction blends Dixon-Coles with Elo.
    full_trust_matches: int = 24
    # Per-team average goals used as the scoring level when no fit is available.
    default_base_goals: float = 1.35
    # Log home advantage used when no fit is available.
    default_home_advantage: float = 0.2
    # Log goal supremacy added per Elo point of difference. About 0.1 extra goal
    # rate per 100 Elo, which keeps the Elo prior modest.
    elo_to_log_goal: float = 0.001
    rho_bound: float = 0.3


@dataclass(frozen=True)
class DixonColesFit:
    attack: dict[str, float]
    defense: dict[str, float]
    intercept: float
    home_advantage: float
    rho: float
    n_matches: int


@dataclass(frozen=True)
class MatchPrediction:
    prob_home_win: float
    prob_draw: float
    prob_away_win: float
    expected_home_goals: float
    expected_away_goals: float
    most_likely_home_goals: int
    most_likely_away_goals: int
    lambda_home: float
    lambda_away: float
    training_matches: int


def fit_dixon_coles(
    matches: pd.DataFrame,
    config: DixonColesConfig | None = None,
) -> DixonColesFit | None:
    """Fit attack, defense, home advantage, and the low-score correction.

    Returns None when there are too few scored matches to fit, in which case the
    caller falls back to the Elo prior.
    """

    config = config or DixonColesConfig()
    scored = matches.dropna(subset=["home_score", "away_score"])

    if len(scored) < config.min_fit_matches:
        return None

    teams = sorted(
        set(scored["home_team_id"].astype(str)) | set(scored["away_team_id"].astype(str))
    )
    if len(teams) < 2:
        return None

    team_index = {team: position for position, team in enumerate(teams)}
    home_idx = scored["home_team_id"].astype(str).map(team_index).to_numpy()
    away_idx = scored["away_team_id"].astype(str).map(team_index).to_numpy()
    home_goals = scored["home_score"].astype(int).to_numpy()
    away_goals = scored["away_score"].astype(int).to_numpy()

    team_count = len(teams)
    mean_goals = float(np.mean(np.concatenate([home_goals, away_goals])))
    intercept0 = math.log(max(mean_goals, 0.2))

    # Parameter vector: intercept, home advantage, rho, attack per team, defense per team.
    x0 = np.concatenate([[intercept0, 0.2, 0.0], np.zeros(team_count), np.zeros(team_count)])
    bounds = (
        [(math.log(0.2), math.log(6.0)), (-1.0, 1.0), (-config.rho_bound, config.rho_bound)]
        + [(-3.0, 3.0)] * team_count
        + [(-3.0, 3.0)] * team_count
    )

    log_factorial_home = gammaln(home_goals + 1.0)
    log_factorial_away = gammaln(away_goals + 1.0)

    def negative_log_likelihood(params: np.ndarray) -> float:
        intercept = params[0]
        home_advantage = params[1]
        rho = params[2]
        attack = params[3 : 3 + team_count]
        defense = params[3 + team_count :]

        log_lambda = intercept + home_advantage + attack[home_idx] - defense[away_idx]
        log_mu = intercept + attack[away_idx] - defense[home_idx]
        lambda_home = np.exp(log_lambda)
        lambda_away = np.exp(log_mu)

        log_poisson = (
            home_goals * log_lambda - lambda_home - log_factorial_home
            + away_goals * log_mu - lambda_away - log_factorial_away
        )

        tau = dixon_coles_tau(home_goals, away_goals, lambda_home, lambda_away, rho)
        log_likelihood = float(np.sum(log_poisson) + np.sum(np.log(tau)))
        penalty = config.ridge * float(np.sum(attack**2) + np.sum(defense**2))

        return -log_likelihood + penalty

    result = minimize(
        negative_log_likelihood,
        x0,
        method="L-BFGS-B",
        bounds=bounds,
    )

    params = result.x
    attack = {team: float(params[3 + position]) for team, position in team_index.items()}
    defense = {
        team: float(params[3 + team_count + position])
        for team, position in team_index.items()
    }

    return DixonColesFit(
        attack=attack,
        defense=defense,
        intercept=float(params[0]),
        home_advantage=float(params[1]),
        rho=float(params[2]),
        n_matches=len(scored),
    )


def dixon_coles_tau(
    home_goals: np.ndarray,
    away_goals: np.ndarray,
    lambda_home: np.ndarray,
    lambda_away: np.ndarray,
    rho: float,
) -> np.ndarray:
    """Dixon-Coles dependence correction for the four lowest scorelines."""

    tau = np.ones_like(lambda_home, dtype=float)

    is_00 = (home_goals == 0) & (away_goals == 0)
    is_01 = (home_goals == 0) & (away_goals == 1)
    is_10 = (home_goals == 1) & (away_goals == 0)
    is_11 = (home_goals == 1) & (away_goals == 1)

    tau[is_00] = 1.0 - lambda_home[is_00] * lambda_away[is_00] * rho
    tau[is_01] = 1.0 + lambda_home[is_01] * rho
    tau[is_10] = 1.0 + lambda_away[is_10] * rho
    tau[is_11] = 1.0 - rho

    return np.clip(tau, 1e-9, None)


def predict_match(
    home_team_id: str,
    away_team_id: str,
    home_elo: float,
    away_elo: float,
    fit: DixonColesFit | None,
    config: DixonColesConfig | None = None,
) -> MatchPrediction:
    """Predict a single match by blending Dixon-Coles with the Elo prior."""

    config = config or DixonColesConfig()

    elo_supremacy = config.elo_to_log_goal * (home_elo - away_elo)
    elo_log_home = math.log(config.default_base_goals) + config.default_home_advantage + 0.5 * elo_supremacy
    elo_log_away = math.log(config.default_base_goals) - 0.5 * elo_supremacy

    if fit is None:
        weight = 0.0
        dc_log_home = elo_log_home
        dc_log_away = elo_log_away
        rho = 0.0
        training_matches = 0
    else:
        weight = min(1.0, fit.n_matches / config.full_trust_matches)
        attack_home = fit.attack.get(home_team_id, 0.0)
        attack_away = fit.attack.get(away_team_id, 0.0)
        defense_home = fit.defense.get(home_team_id, 0.0)
        defense_away = fit.defense.get(away_team_id, 0.0)
        dc_log_home = fit.intercept + fit.home_advantage + attack_home - defense_away
        dc_log_away = fit.intercept + attack_away - defense_home
        rho = fit.rho
        training_matches = fit.n_matches

    log_home = weight * dc_log_home + (1.0 - weight) * elo_log_home
    log_away = weight * dc_log_away + (1.0 - weight) * elo_log_away
    lambda_home = math.exp(log_home)
    lambda_away = math.exp(log_away)

    matrix = scoreline_matrix(lambda_home, lambda_away, rho, config.max_goals)
    return summarize_matrix(matrix, lambda_home, lambda_away, training_matches)


def scoreline_matrix(
    lambda_home: float,
    lambda_away: float,
    rho: float,
    max_goals: int,
) -> np.ndarray:
    """Joint probability of every exact scoreline up to max_goals per side."""

    goals = np.arange(max_goals + 1)
    home_pmf = poisson_pmf(goals, lambda_home)
    away_pmf = poisson_pmf(goals, lambda_away)
    matrix = np.outer(home_pmf, away_pmf)

    matrix[0, 0] *= 1.0 - lambda_home * lambda_away * rho
    matrix[0, 1] *= 1.0 + lambda_home * rho
    matrix[1, 0] *= 1.0 + lambda_away * rho
    matrix[1, 1] *= 1.0 - rho

    matrix = np.clip(matrix, 0.0, None)
    total = matrix.sum()

    return matrix / total if total > 0 else matrix


def poisson_pmf(goals: np.ndarray, rate: float) -> np.ndarray:
    return np.exp(goals * math.log(rate) - rate - gammaln(goals + 1.0))


def summarize_matrix(
    matrix: np.ndarray,
    lambda_home: float,
    lambda_away: float,
    training_matches: int,
) -> MatchPrediction:
    home_win = float(np.tril(matrix, -1).sum())
    draw = float(np.trace(matrix))
    away_win = float(np.triu(matrix, 1).sum())

    goals = np.arange(matrix.shape[0])
    expected_home = float((matrix.sum(axis=1) * goals).sum())
    expected_away = float((matrix.sum(axis=0) * goals).sum())

    most_likely_home, most_likely_away = np.unravel_index(int(matrix.argmax()), matrix.shape)

    return MatchPrediction(
        prob_home_win=home_win,
        prob_draw=draw,
        prob_away_win=away_win,
        expected_home_goals=expected_home,
        expected_away_goals=expected_away,
        most_likely_home_goals=int(most_likely_home),
        most_likely_away_goals=int(most_likely_away),
        lambda_home=lambda_home,
        lambda_away=lambda_away,
        training_matches=training_matches,
    )
