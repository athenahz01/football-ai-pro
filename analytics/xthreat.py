from __future__ import annotations

import numpy as np
import pandas as pd
import socceraction.xthreat as xthreat

PUBLISHED_XT_GRID_URL = "https://karun.in/blog/data/open_xt_12x8_v1.json"


def add_xt_values(actions: pd.DataFrame) -> pd.DataFrame:
    valued_actions = actions.copy()

    if valued_actions.empty:
        valued_actions["xt_value"] = []
        return valued_actions

    model = load_xt_model(valued_actions)
    values = model.rate(valued_actions)
    valued_actions["xt_value"] = [
        None if np.isnan(value) else float(value) for value in values
    ]

    return valued_actions


def load_xt_model(actions: pd.DataFrame) -> xthreat.ExpectedThreat:
    # Prefer the published 12 by 8 grid so Phase 0 runs are deterministic.
    # If it is unavailable, fit on loaded actions and print the limitation.
    try:
        return xthreat.load_model(PUBLISHED_XT_GRID_URL)
    except Exception as error:
        print(
            "Published xT grid could not be loaded. "
            "Fitting xT on the loaded actions, which is noisy for a small dataset. "
            f"Reason: {error}"
        )

    if actions.empty:
        raise RuntimeError("Cannot fit xT because no SPADL actions are available.")

    return xthreat.ExpectedThreat(l=12, w=8).fit(actions)
