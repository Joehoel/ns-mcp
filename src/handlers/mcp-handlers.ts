/**
 * MCP tool handlers using Effect services
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect, Match, Option } from "effect";
import { z } from "zod";
import { NsApiService } from "../services/NsApiService";
import { StationService } from "../services/StationService";

/**
 * Register NS train tools on the MCP server
 */
export function registerTools(
  server: McpServer,
  runEffect: <A, E, R extends StationService | NsApiService>(
    effect: Effect.Effect<A, E, R>,
  ) => Promise<A>,
): void {
  // --- Tool: get_next_departure ---
  server.tool(
    "get_next_departure",
    "Get the next train departures from one station to another using the Trips API. Shows both direct connections and connections with transfers.",
    {
      from_station: z
        .string()
        .describe("Vertrekstation (bijv. 'Amsterdam Centraal')"),
      to_station: z
        .string()
        .describe("Bestemmingstation (bijv. 'Utrecht Centraal')"),
      limit: z
        .number()
        .min(1)
        .max(10)
        .default(3)
        .describe("Aantal reisadviezen om te tonen"),
    },
    async ({ from_station, to_station, limit }) => {
      const program = Effect.gen(function* () {
        // Get services from context
        const stationService = yield* StationService;
        const nsApiService = yield* NsApiService;

        // Look up station codes
        const maybeFromCode =
          yield* stationService.lookupStationCode(from_station);
        const maybeToCode = yield* stationService.lookupStationCode(to_station);

        // Check if both stations were found
        if (Option.isNone(maybeFromCode)) {
          return {
            success: false,
            error: `Station '${from_station}' niet gevonden.`,
          };
        }

        if (Option.isNone(maybeToCode)) {
          return {
            success: false,
            error: `Station '${to_station}' niet gevonden.`,
          };
        }

        const fromCode = maybeFromCode.value;
        const toCode = maybeToCode.value;

        // Fetch trip data
        const data = yield* nsApiService.getTrips(fromCode, toCode);

        if (data.trips.length === 0) {
          return {
            success: false,
            error: "Geen reisadviezen beschikbaar via de Trips API.",
          };
        }

        // Format the results
        const tripsToShow = data.trips.slice(0, limit);
        const resultLines: string[] = [
          `Volgende treinen van ${from_station} naar ${to_station}:`,
        ];

        for (const trip of tripsToShow) {
          const legs = trip.legs;

          if (legs.length === 1) {
            // Direct train
            const leg = legs[0];
            const plannedTime =
              leg.origin.plannedDateTime?.slice(11, 16) ?? "??:??";
            const arrivalTime =
              leg.destination.plannedDateTime?.slice(11, 16) ?? "??:??";
            const trainType = leg.product?.longCategoryName ?? "Trein";
            const spoor = leg.origin.plannedTrack ?? "?";
            const direction = leg.destination.name ?? to_station;

            resultLines.push(
              `• ${plannedTime} (aankomst ${arrivalTime}) - Spoor ${spoor} - ${trainType} naar ${direction} (direct)`,
            );
          } else {
            // Trip with transfer(s)
            const firstLeg = legs[0];
            const lastLeg = legs[legs.length - 1];

            const departureTime =
              firstLeg.origin.plannedDateTime?.slice(11, 16) ?? "??:??";
            const arrivalTime =
              lastLeg.destination.plannedDateTime?.slice(11, 16) ?? "??:??";
            const spoor = firstLeg.origin.plannedTrack ?? "?";

            // Describe the route
            const routeDescription = legs.map((leg) => {
              const trainType = leg.product?.longCategoryName ?? "Trein";
              const direction = leg.destination.name ?? "onbekend";
              return `${trainType} naar ${direction}`;
            });

            const transfers = legs.length - 1;
            const transferText = `${transfers} overstap${transfers > 1 ? "pen" : ""}`;

            resultLines.push(
              `• ${departureTime} (aankomst ${arrivalTime}) - Spoor ${spoor} - ${routeDescription.join(" → ")} (${transferText})`,
            );
          }
        }

        return {
          success: true,
          result: resultLines.join("\n"),
        };
      }).pipe(
        Effect.catchAll((error) =>
          Effect.succeed({
            success: false,
            error: Match.value(error).pipe(
              Match.tag("NsApiError", (e) => e.message),
              Match.tag("ParseError", (e) => e.message),
              Match.orElse(() => String(error)),
            ),
          }),
        ),
      );

      const result = await runEffect(program);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  // --- Tool: get_departures ---
  server.tool(
    "get_departures",
    "Get all departures from a specific station. Uses the NS Departures API.",
    {
      station: z.string().describe("Station naam (bijv. 'Amsterdam Centraal')"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Aantal vertrektijden om te tonen"),
    },
    async ({ station, limit }) => {
      const program = Effect.gen(function* () {
        // Get services from context
        const stationService = yield* StationService;
        const nsApiService = yield* NsApiService;

        // Look up station code
        const maybeStationCode =
          yield* stationService.lookupStationCode(station);

        // Check if station was found
        if (Option.isNone(maybeStationCode)) {
          return {
            success: false,
            error: `Station '${station}' niet gevonden.`,
          };
        }

        const stationCode = maybeStationCode.value;

        // Fetch departures
        const data = yield* nsApiService.getDepartures(stationCode);

        if (data.payload.departures.length === 0) {
          return {
            success: false,
            error: "Geen vertrektijden beschikbaar of API-fout.",
          };
        }

        // Format the results
        const departures = data.payload.departures.slice(0, limit);
        const resultLines: string[] = [`Vertrektijden vanaf ${station}:`];

        for (const dep of departures) {
          const plannedTime = dep.plannedDateTime.slice(11, 16);
          const direction = dep.direction;
          const trainType = dep.trainCategory;
          const track = dep.plannedTrack;

          resultLines.push(
            `• ${plannedTime} - Spoor ${track} - ${trainType} naar ${direction}`,
          );
        }

        return {
          success: true,
          result: resultLines.join("\n"),
        };
      }).pipe(
        Effect.catchAll((error) =>
          Effect.succeed({
            success: false,
            error: Match.value(error).pipe(
              Match.tag("NsApiError", (e) => e.message),
              Match.tag("ParseError", (e) => e.message),
              Match.orElse(() => String(error)),
            ),
          }),
        ),
      );

      const result = await runEffect(program);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );
}
