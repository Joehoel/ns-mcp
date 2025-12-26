/**
 * NS API Service using Effect
 */

import {
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { NsApiError, ParseError } from "../errors";
import { Context, Effect, Layer } from "effect";
import * as Schemas from "../schemas";
import { NsHttpClient } from "./NsHttpClient";

export class NsApiService extends Context.Tag("NsApiService")<
  NsApiService,
  {
    readonly getDepartures: (
      stationCode: string,
    ) => Effect.Effect<Schemas.DeparturesResponse, NsApiError | ParseError>;
    readonly getTrips: (
      fromCode: string,
      toCode: string,
    ) => Effect.Effect<Schemas.TripsResponse, NsApiError | ParseError>;
  }
>() {}

export const NsApiServiceLive = Layer.effect(
  NsApiService,
  Effect.gen(function* () {
    const httpClient = yield* NsHttpClient;

    const getDepartures = (stationCode: string) =>
      Effect.gen(function* () {
        const response = yield* HttpClientRequest.get(`/v2/departures`).pipe(
          HttpClientRequest.setUrlParam("station", stationCode),
          httpClient.execute,
          Effect.flatMap(
            HttpClientResponse.schemaBodyJson(Schemas.DeparturesResponse),
          ),
          Effect.mapError((error) => {
            if (HttpClientError.isHttpClientError(error)) {
              return new NsApiError({
                endpoint: "/v2/departures",
                message: `NS API request failed: ${error._tag}`,
                status:
                  error._tag === "ResponseError"
                    ? error.response.status
                    : undefined,
              });
            }
            return new ParseError({
              message: `Failed to parse departures response: ${error}`,
              cause: error,
            });
          }),
        );

        return response;
      });

    const getTrips = (fromCode: string, toCode: string) =>
      Effect.gen(function* () {
        const response = yield* HttpClientRequest.get(`/v3/trips`).pipe(
          HttpClientRequest.setUrlParam("fromStation", fromCode),
          HttpClientRequest.setUrlParam("toStation", toCode),
          httpClient.execute,
          Effect.flatMap(
            HttpClientResponse.schemaBodyJson(Schemas.TripsResponse),
          ),
          Effect.mapError((error) => {
            if (HttpClientError.isHttpClientError(error)) {
              return new NsApiError({
                endpoint: "/v3/trips",
                message: `NS API request failed: ${error._tag}`,
                status:
                  error._tag === "ResponseError"
                    ? error.response.status
                    : undefined,
              });
            }
            return new ParseError({
              message: `Failed to parse trips response: ${error}`,
              cause: error,
            });
          }),
        );

        return response;
      });

    return {
      getDepartures,
      getTrips,
    } as const;
  }),
);
