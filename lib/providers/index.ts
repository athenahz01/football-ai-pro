import { config } from "@/lib/config/env";
import { StatsBombOpenDataProvider } from "@/lib/providers/statsbomb-open";
import type { DataProviderId, StatsProvider } from "@/lib/providers/types";

export function getProvider(): StatsProvider {
  const provider = config.dataProvider;

  switch (provider) {
    case "statsbomb_open":
      return new StatsBombOpenDataProvider();
    case "api_football":
      // Register ApiFootballProvider here later. Product code only sees StatsProvider,
      // so changing DATA_PROVIDER is the only source switch needed.
      throw new Error("ApiFootballProvider is not implemented yet.");
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
