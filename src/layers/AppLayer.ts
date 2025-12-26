/**
 * Application layer composition - provides all services with proper dependency injection
 */

import { FetchHttpClient } from "@effect/platform"
import { Effect, Layer, Logger, ManagedRuntime } from "effect"
import { AppConfig, AppConfigLive } from "../config"
import { NsApiServiceLive } from "../services/NsApiService"
import { NsHttpClientLive } from "../services/NsHttpClient"
import { StationServiceLive } from "../services/StationService"

/**
 * Logging layer that uses JSON format in production, pretty format in development
 */
const LoggingLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* AppConfig
    return config.environment === "production"
      ? Logger.json
      : Logger.pretty
  })
)

/**
 * Main application layer that composes all services and their dependencies
 *
 * Dependency graph:
 * - AppConfig: reads from environment (via ConfigProvider)
 * - StationService: no dependencies
 * - HttpClient: provided by FetchHttpClient.layer
 * - NsHttpClient: depends on AppConfig + HttpClient
 * - NsApiService: depends on NsHttpClient
 * - Logging: depends on AppConfig (for environment detection)
 */
export const AppLayer = StationServiceLive.pipe(
  Layer.provideMerge(NsApiServiceLive),
  Layer.provideMerge(NsHttpClientLive),
  Layer.provideMerge(LoggingLayer),
  Layer.provideMerge(AppConfigLive),
  Layer.provide(FetchHttpClient.layer)
)

/**
 * Creates a ManagedRuntime for executing Effect programs with the full application context
 */
export const AppRuntime = ManagedRuntime.make(AppLayer)
