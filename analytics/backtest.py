"""Walk-forward backtest of the win probability model.

This measures how well the pre-match predictions match what actually happened,
using the same walk-forward predictions the runner stores. Each match is scored
only by a model that never saw it. We report three way accuracy against two honest
baselines, plus the Brier score and log loss, which reward calibrated probabilities
rather than just the top pick.

Honesty note on the data. This database holds a single 28 day tournament, 64
matches, with only three to seven matches per team. Elo starts cold, so the early
group games are close to uninformed, and the Dixon-Coles strengths are thin. The
reference Hicruben model reached about 61 percent three way accuracy on years of
international results. We cannot reach that on one tournament, and this report does
not pretend to. The value here is that the pipeline is correct and the numbers are
honest. Real accuracy validation comes when the licensed historical backbone lands
and the same model is fit on seasons of data.

Penalty shootouts are not modeled. A match level after extra time counts as a draw,
matching how scores are stored.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from analytics import db
from analytics.dixon_coles import DixonColesConfig
from analytics.elo import EloConfig
from analytics.run_predictions import MATCHES_QUERY, iter_walk_forward_predictions

REPORT_DIR = Path(__file__).resolve().parent / "reports"
OUTCOME_LABELS = ("home_win", "draw", "away_win")


@dataclass
class MatchScore:
    actual: str
    predicted: str
    probabilities: dict[str, float]
    training_matches: int


def main() -> None:
    elo_config = EloConfig()
    dixon_coles_config = DixonColesConfig()

    with db.connect() as connection:
        matches = db.read_dataframe(connection, MATCHES_QUERY)

    if matches.empty:
        print("No matches found to back test.")
        return

    scores = collect_scores(matches, elo_config, dixon_coles_config)
    report = build_report(scores)
    write_report(report)
    print_summary(report)


def collect_scores(
    matches: pd.DataFrame,
    elo_config: EloConfig,
    dixon_coles_config: DixonColesConfig,
) -> list[MatchScore]:
    scores: list[MatchScore] = []

    for match, _, _, prediction, _ in iter_walk_forward_predictions(
        matches,
        elo_config,
        dixon_coles_config,
    ):
        if pd.isna(match.home_score) or pd.isna(match.away_score):
            continue

        probabilities = {
            "home_win": float(prediction.prob_home_win),
            "draw": float(prediction.prob_draw),
            "away_win": float(prediction.prob_away_win),
        }
        scores.append(
            MatchScore(
                actual=actual_outcome(int(match.home_score), int(match.away_score)),
                predicted=max(probabilities, key=probabilities.get),
                probabilities=probabilities,
                training_matches=int(prediction.training_matches),
            )
        )

    return scores


def actual_outcome(home_goals: int, away_goals: int) -> str:
    if home_goals > away_goals:
        return "home_win"
    if home_goals < away_goals:
        return "away_win"
    return "draw"


def build_report(scores: list[MatchScore]) -> dict[str, Any]:
    total = len(scores)
    model_correct = sum(1 for score in scores if score.predicted == score.actual)
    home_baseline_correct = sum(1 for score in scores if score.actual == "home_win")
    majority_label = most_common_outcome(scores)
    majority_correct = sum(1 for score in scores if score.actual == majority_label)

    fitted = [score for score in scores if score.training_matches > 0]
    fitted_correct = sum(1 for score in fitted if score.predicted == score.actual)

    return {
        "generated_for": "Football AI Pro win probability",
        "matches": total,
        "model_accuracy": ratio(model_correct, total),
        "home_pick_baseline_accuracy": ratio(home_baseline_correct, total),
        "majority_class": majority_label,
        "majority_class_baseline_accuracy": ratio(majority_correct, total),
        "model_accuracy_on_fitted_matches": ratio(fitted_correct, len(fitted)),
        "fitted_matches": len(fitted),
        "mean_probability_on_actual": mean_probability_on_actual(scores),
        "brier_score": multiclass_brier(scores),
        "log_loss": log_loss(scores),
        "outcome_counts": outcome_counts(scores),
    }


def mean_probability_on_actual(scores: list[MatchScore]) -> float:
    """Average probability the model gave to the outcome that happened.

    This is the clearest signal indicator. A value near 0.333 means the model is
    close to a uniform guess, which is what thin single-tournament data produces.
    """

    if not scores:
        return 0.0

    total = sum(score.probabilities[score.actual] for score in scores)
    return round(total / len(scores), 4)


def most_common_outcome(scores: list[MatchScore]) -> str:
    counts = outcome_counts(scores)
    return max(OUTCOME_LABELS, key=lambda label: counts[label])


def outcome_counts(scores: list[MatchScore]) -> dict[str, int]:
    counts = {label: 0 for label in OUTCOME_LABELS}

    for score in scores:
        counts[score.actual] += 1

    return counts


def multiclass_brier(scores: list[MatchScore]) -> float:
    if not scores:
        return 0.0

    total = 0.0

    for score in scores:
        for label in OUTCOME_LABELS:
            actual = 1.0 if score.actual == label else 0.0
            total += (score.probabilities[label] - actual) ** 2

    return round(total / len(scores), 4)


def log_loss(scores: list[MatchScore]) -> float:
    if not scores:
        return 0.0

    total = 0.0

    for score in scores:
        probability = max(score.probabilities[score.actual], 1e-12)
        total += -math.log(probability)

    return round(total / len(scores), 4)


def ratio(correct: int, total: int) -> float:
    return round(correct / total, 4) if total else 0.0


def write_report(report: dict[str, Any]) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "win_probability_backtest.json").write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    (REPORT_DIR / "win_probability_backtest.md").write_text(
        build_markdown(report),
        encoding="utf-8",
    )


def build_markdown(report: dict[str, Any]) -> str:
    counts = report["outcome_counts"]

    lines = [
        "# Win Probability Backtest",
        "",
        "Walk-forward over every match. Each match is predicted by a model fit only",
        "on earlier matches, then scored against the real result. Penalty shootouts",
        "are not modeled, so a match level after extra time counts as a draw.",
        "",
        "## Data limitation",
        "",
        "This database holds one 28 day tournament, "
        f"{report['matches']} matches, with three to seven matches per team. Elo",
        "starts cold and the Dixon-Coles strengths are thin, so the model has almost",
        f"no signal to separate outcomes. It gives the outcome that actually happened",
        f"a mean probability of {report['mean_probability_on_actual']}, which is close to a uniform",
        "0.333 guess. That is the honest result on this data.",
        "",
        "Two cautions on the baselines. First, the reference model reached about 61",
        "percent three way accuracy on years of international fixtures, which include",
        "many lopsided qualifiers and friendlies. This dataset is World Cup only:",
        "elite teams at neutral venues in tight matches, where three way accuracy is",
        "inherently far lower for any model, so 61 percent is not a fair target here.",
        "Second, the home pick baseline is flattered because at neutral venues the",
        "home label is essentially arbitrary, so beating it on 64 matches is noise,",
        "not skill. Real validation comes with the licensed historical backbone, where",
        "the same model is fit on seasons of data.",
        "",
        "## Results",
        "",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Matches scored | {report['matches']} |",
        f"| Model three way accuracy | {percent(report['model_accuracy'])} |",
        f"| Home pick baseline | {percent(report['home_pick_baseline_accuracy'])} |",
        f"| Majority class baseline ({report['majority_class']}) | {percent(report['majority_class_baseline_accuracy'])} |",
        f"| Model accuracy on fitted matches ({report['fitted_matches']}) | {percent(report['model_accuracy_on_fitted_matches'])} |",
        f"| Mean probability on actual outcome (0.333 is uniform) | {report['mean_probability_on_actual']} |",
        f"| Brier score (lower is better) | {report['brier_score']} |",
        f"| Log loss (lower is better) | {report['log_loss']} |",
        "",
        "## Actual outcome mix",
        "",
        f"Home wins {counts['home_win']}, draws {counts['draw']}, away wins {counts['away_win']}.",
        "",
    ]

    return "\n".join(lines)


def percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def print_summary(report: dict[str, Any]) -> None:
    print(
        f"Model three way accuracy {percent(report['model_accuracy'])} "
        f"over {report['matches']} matches."
    )
    print(
        f"Home pick baseline {percent(report['home_pick_baseline_accuracy'])}, "
        f"majority class baseline {percent(report['majority_class_baseline_accuracy'])} "
        f"({report['majority_class']})."
    )
    print(
        f"Mean probability on the actual outcome {report['mean_probability_on_actual']} "
        "(0.333 is a uniform guess)."
    )
    print(
        f"Brier score {report['brier_score']}, log loss {report['log_loss']}."
    )
    print(f"Report written to {REPORT_DIR}.")


if __name__ == "__main__":
    main()
