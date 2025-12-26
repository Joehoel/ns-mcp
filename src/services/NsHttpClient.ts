/**
 * NS API HTTP Client Service using Effect's HttpClient
 */

import { HttpClient, HttpClientRequest } from "@effect/platform";
import { AppConfig } from "../config";
import { Context, Effect, Layer } from "effect";

export class NsHttpClient extends Context.Tag("NsHttpClient")<
  NsHttpClient,
  HttpClient.HttpClient
>() {}

export const NsHttpClientLive = Layer.effect(
  NsHttpClient,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const baseClient = yield* HttpClient.HttpClient;

    return baseClient.pipe(
      HttpClient.mapRequest(
        HttpClientRequest.prependUrl(
          "https://gateway.apiportal.ns.nl/reisinformatie-api/api",
        ),
      ),
      HttpClient.mapRequest(
        HttpClientRequest.setHeader(
          "Ocp-Apim-Subscription-Key",
          config.nsApiKey,
        ),
      ),
    );
  }),
);
