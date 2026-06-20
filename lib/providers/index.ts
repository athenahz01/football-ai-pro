import { config } from "@/lib/config/env";
import { ApiFootballProvider } from "@/lib/providers/api-football";
import { StatsBombOpenDataProvider } from "@/lib/providers/statsbomb-open";
import type { DataProviderId, StatsProvider } from "@/lib/providers/types";

export function getProvider(): StatsProvider {
  const provider = config.dataProvider;

  switch (provider) {
    case "statsbomb_open":
      return new StatsBombOpenDataProvider();
    case "api_football":
      // Product code only sees StatsProvider, so changing DATA_PROVIDER to
      // api_football is the only switch needed to select the commercial source.
      return new ApiFootballProvider({ apiKey: config.apiFootballKey });
    default:
      throw new Error(`Unknown data provider: ${provider satisfies never}`);
  }
}

export type { DataProviderId, StatsProvider };
export type {
  Competition,
  Match,
  MatchEvent,
  Player,
  Team,
} from "@/lib/providers/types";
