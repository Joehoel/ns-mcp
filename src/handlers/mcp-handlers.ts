/**
 * MCP tool handlers using Effect services
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Duration, Effect, Match, Option } from "effect";
import { z } from "zod";
import * as chrono from "chrono-node";
import { format, toZonedTime } from "date-fns-tz";
import { NsApiService } from "../services/NsApiService";
import { StationService } from "../services/StationService";
import {
  ALL_TRANSPORTATION_TYPES,
  matchesTransportationType,
} from "../types";

/**
 * Calculate delay in minutes between planned and actual time
 * Returns null if times are missing or if there's no delay
 */
function calculateDelayMinutes(
  planned?: string,
  actual?: string,
): number | null {
  if (!planned || !actual) return null;
  const plannedDate = new Date(planned);
  const actualDate = new Date(actual);
  const diffMs = actualDate.getTime() - plannedDate.getTime();
  const delayMinutes = Math.round(diffMs / 60000);
  return delayMinutes === 0 ? null : delayMinutes;
}

/**
 * Zod schema for transportation types parameter
 */
const transportationTypesSchema = z
  .array(
    z.enum([
      "TRAIN",
      "BUS",
      "TRAM",
      "METRO",
      "FERRY",
      "WALK",
      "BIKE",
      "CAR",
      "TAXI",
      "SHARED_MODALITY",
      "UNKNOWN",
    ]),
  )
  .optional()
  .describe(
    "Vervoerstypen om te tonen (bijv. ['TRAIN', 'BUS']). Als niet opgegeven, worden alle typen getoond.",
  );

/**
 * Zod schema for datetime that parses natural language to ISO format
 * with Amsterdam timezone and validates it's in the future
 */
const dateTimeSchema = z
  .string()
  .transform((value, ctx) => {
    const now = new Date();

    const parsed = chrono.nl.parse(value, now, { forwardDate: true });

    if (parsed.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Kon de datum/tijd '${value}' niet begrijpen. Probeer een format zoals 'morgen 10:00', 'woensdag 14:30', of '2025-12-27T10:30'`,
      });
      return z.NEVER;
    }

    const result = parsed[0];
    const parsedDate = result.start.date();

    if (isNaN(parsedDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Ongeldige datum: '${value}'`,
      });
      return z.NEVER;
    }

    if (parsedDate <= now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `De datum/tijd '${value}' ligt in het verleden. Geef een datum/tijd in de toekomst op.`,
      });
      return z.NEVER;
    }

    const amsterdamTz = "Europe/Amsterdam";
    const zonedDate = toZonedTime(parsedDate, amsterdamTz);
    const isoString = format(zonedDate, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: amsterdamTz });

    return isoString;
  })
  .optional();

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
    "Get departures from one station to another using the Trips API. Shows both direct connections and connections with transfers. Returns structured JSON data with delay and cancellation information. Optionally specify a datetime to search for trips at a future date/time.",
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
      date_time: dateTimeSchema.describe(
        "Datum/tijd voor het reisadvies (bijv. 'morgen 10:00', 'woensdag 14:30'). Wordt automatisch omgezet naar Amsterdam tijdzone en ISO format. Zoek op 'nu' of laat weg voor huidige tijd.",
      ),
      search_for_arrival: z
        .boolean()
        .optional()
        .describe(
          "Indien waar, geeft de datum/tijd de aankomsttijd op in plaats van de vertrektijd. Standaard: false (zoeken op vertrektijd).",
        ),
      transportation_types: transportationTypesSchema,
    },
    async ({ from_station, to_station, limit, date_time, search_for_arrival, transportation_types }) => {
      const program = Effect.gen(function* () {
        const stationService = yield* StationService;
        const nsApiService = yield* NsApiService;

        yield* Effect.logInfo("Processing get_next_departure request").pipe(
          Effect.annotateLogs({
            from_station,
            to_station,
            limit,
            date_time: date_time ?? null,
            search_for_arrival: search_for_arrival ?? false,
            transportation_types: transportation_types?.join(",") ?? null,
          }),
        );

        // Look up station codes
        const maybeFromCode =
          yield* stationService.lookupStationCode(from_station);
        const maybeToCode = yield* stationService.lookupStationCode(to_station);

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

        // For trips API, convert selected types to disabled types (exclude logic)
        const disabledTypes =
          transportation_types && transportation_types.length > 0
            ? ALL_TRANSPORTATION_TYPES.filter(
                (type) => !transportation_types.includes(type),
              )
            : undefined;

        const [nsApiDuration, data] = yield* Effect.timed(
          nsApiService.getTrips(
            fromCode,
            toCode,
            disabledTypes,
            date_time,
            search_for_arrival,
          ),
        );

        // Client-side filtering (in case API doesn't support filtering)
        const filteredTrips =
          transportation_types && transportation_types.length > 0
            ? data.trips.filter((trip) =>
                trip.legs.some((leg) => {
                  const productType = leg.product?.type;
                  if (productType && transportation_types.includes(productType as typeof transportation_types[number])) {
                    return true;
                  }
                  // Fallback to name matching
                  const productName = leg.product?.longCategoryName;
                  return matchesTransportationType(
                    productName,
                    transportation_types,
                  );
                }),
              )
            : data.trips;

        if (filteredTrips.length === 0) {
          return {
            success: false,
            error: "Geen reisadviezen beschikbaar.",
          };
        }

        // Format as structured JSON
        const tripsToShow = filteredTrips.slice(0, limit);

        const firstTrip = tripsToShow[0];
        const firstDeparture =
          firstTrip?.legs[0]?.origin.plannedDateTime ?? null;
        const firstArrival =
          firstTrip?.legs[firstTrip.legs.length - 1]?.destination.plannedDateTime ??
          null;

        const transfers = tripsToShow.map((t) => t.legs.length - 1);
        const minTransfers = transfers.length > 0 ? Math.min(...transfers) : null;
        const maxTransfers = transfers.length > 0 ? Math.max(...transfers) : null;

        yield* Effect.logInfo("get_next_departure summary").pipe(
          Effect.annotateLogs({
            fromCode,
            toCode,
            nsApiDurationMs: Duration.toMillis(nsApiDuration),
            totalTrips: data.trips.length,
            filteredTrips: filteredTrips.length,
            returnedTrips: tripsToShow.length,
            firstDeparture,
            firstArrival,
            minTransfers,
            maxTransfers,
          }),
        );

        return {
          success: true,
          data: {
            from: from_station,
            to: to_station,
            trips: tripsToShow.map((trip) => ({
              status: trip.status ?? null,
              transfers: trip.legs.length - 1,
              legs: trip.legs.map((leg) => ({
                type: leg.product?.type ?? null,
                product:
                  leg.product?.displayName ??
                  leg.product?.longCategoryName ??
                  null,
                productNumber: leg.product?.number ?? null,
                origin: {
                  name: leg.origin.name ?? null,
                  plannedTime: leg.origin.plannedDateTime ?? null,
                  actualTime: leg.origin.actualDateTime ?? null,
                  delayMinutes: calculateDelayMinutes(
                    leg.origin.plannedDateTime,
                    leg.origin.actualDateTime,
                  ),
                  track: leg.origin.plannedTrack ?? null,
                  trackChanged:
                    leg.origin.actualTrack &&
                    leg.origin.actualTrack !== leg.origin.plannedTrack
                      ? leg.origin.actualTrack
                      : null,
                },
                destination: {
                  name: leg.destination.name ?? null,
                  plannedTime: leg.destination.plannedDateTime ?? null,
                  actualTime: leg.destination.actualDateTime ?? null,
                  delayMinutes: calculateDelayMinutes(
                    leg.destination.plannedDateTime,
                    leg.destination.actualDateTime,
                  ),
                },
              })),
            })),
          },
        };
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError("get_next_departure failed").pipe(
              Effect.annotateLogs({
                error: String(error),
                from_station,
                to_station,
              })
            );
            return {
              success: false,
              error: Match.value(error).pipe(
                Match.tag("NsApiError", (e) => e.message),
                Match.tag("ParseError", (e) => e.message),
                Match.orElse(() => String(error)),
              ),
            };
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
    "Get all departures from a specific station. Returns structured JSON data with delay and cancellation information.",
    {
      station: z.string().describe("Station naam (bijv. 'Amsterdam Centraal')"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Aantal vertrektijden om te tonen"),
      transportation_types: transportationTypesSchema,
    },
    async ({ station, limit, transportation_types }) => {
      const program = Effect.gen(function* () {
        const stationService = yield* StationService;
        const nsApiService = yield* NsApiService;

        yield* Effect.logInfo("Processing get_departures request").pipe(
          Effect.annotateLogs({
            station,
            limit,
            transportation_types: transportation_types?.join(",") ?? null,
          }),
        );

        const maybeStationCode =
          yield* stationService.lookupStationCode(station);

        if (Option.isNone(maybeStationCode)) {
          return {
            success: false,
            error: `Station '${station}' niet gevonden.`,
          };
        }

        const stationCode = maybeStationCode.value;

        const [nsApiDuration, data] = yield* Effect.timed(
          nsApiService.getDepartures(stationCode),
        );

        // Client-side filtering
        const filteredDepartures =
          transportation_types && transportation_types.length > 0
            ? data.payload.departures.filter((dep) => {
                const productType = dep.product?.type;
                if (productType && transportation_types.includes(productType as typeof transportation_types[number])) {
                  return true;
                }
                // Fallback to name matching
                const productName =
                  dep.product?.longCategoryName ?? dep.trainCategory;
                return matchesTransportationType(
                  productName,
                  transportation_types,
                );
              })
            : data.payload.departures;

        if (filteredDepartures.length === 0) {
          return {
            success: false,
            error: "Geen vertrektijden beschikbaar.",
          };
        }

        // Format as structured JSON
        const departures = filteredDepartures.slice(0, limit);

        yield* Effect.logInfo("get_departures summary").pipe(
          Effect.annotateLogs({
            stationCode,
            nsApiDurationMs: Duration.toMillis(nsApiDuration),
            totalDepartures: data.payload.departures.length,
            filteredDepartures: filteredDepartures.length,
            returnedDepartures: departures.length,
            firstPlannedDeparture: departures[0]?.plannedDateTime ?? null,
          }),
        );

        return {
          success: true,
          data: {
            station: station,
            departures: departures.map((dep) => ({
              type: dep.product?.type ?? "TRAIN",
              product:
                dep.product?.displayName ??
                dep.product?.longCategoryName ??
                dep.trainCategory,
              productNumber: dep.product?.number ?? null,
              direction: dep.direction,
              plannedTime: dep.plannedDateTime,
              actualTime: dep.actualDateTime ?? null,
              delayMinutes: calculateDelayMinutes(
                dep.plannedDateTime,
                dep.actualDateTime,
              ),
              track: dep.plannedTrack,
              trackChanged:
                dep.actualTrack && dep.actualTrack !== dep.plannedTrack
                  ? dep.actualTrack
                  : null,
              cancelled: dep.cancelled,
            })),
          },
        };
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError("get_departures failed").pipe(
              Effect.annotateLogs({
                error: String(error),
                station,
              })
            );
            return {
              success: false,
              error: Match.value(error).pipe(
                Match.tag("NsApiError", (e) => e.message),
                Match.tag("ParseError", (e) => e.message),
                Match.orElse(() => String(error)),
              ),
            };
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
