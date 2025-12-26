/**
 * Station lookup service using Effect
 */

import * as fuzzball from "fuzzball";
import { STATIONS } from "../stations";
import { Context, Effect, Layer, Option } from "effect";

// Pre-computed station data for efficient lookup
const stationNames = Object.keys(STATIONS);
const normalizedStationMap = new Map<string, string>(
  stationNames.map((name) => [name.toLowerCase(), name]),
);

/**
 * Convert string to title case (first letter of each word capitalized)
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export class StationService extends Context.Tag("StationService")<
  StationService,
  {
    readonly lookupStationCode: (
      stationName: string,
    ) => Effect.Effect<Option.Option<string>>;
  }
>() {}

export const StationServiceLive = Layer.succeed(StationService, {
  lookupStationCode: (stationName: string) =>
    Effect.sync(() => {
      const normalizedInput = stationName.toLowerCase();

      // Try exact match first (case-insensitive)
      const exactMatch = normalizedStationMap.get(normalizedInput);
      if (exactMatch) {
        return Option.some(STATIONS[exactMatch]);
      }

      // Try title case match
      const titleCaseName = toTitleCase(stationName);
      if (STATIONS[titleCaseName]) {
        return Option.some(STATIONS[titleCaseName]);
      }

      // Fall back to fuzzy matching using fuzzball
      // Use token_sort_ratio for better handling of multi-word station names
      const results = fuzzball.extract(stationName, stationNames, {
        scorer: fuzzball.token_sort_ratio,
        limit: 1,
        cutoff: 70, // Minimum score threshold (0-100)
      });

      if (results.length > 0) {
        const [bestMatch, score] = results[0];
        // Additional validation: ensure match is reasonably close
        if (score >= 70) {
          return Option.some(STATIONS[bestMatch]);
        }
      }

      return Option.none();
    }),
});
