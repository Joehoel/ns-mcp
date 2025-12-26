/**
 * Application layer composition - provides all services with proper dependency injection
 */

import { FetchHttpClient, Headers } from "@effect/platform"
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
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
 * OpenTelemetry layer for distributed tracing with spans
 */
const TracingLayer = NodeSdk.layer(() => ({
  resource: {
    serviceName: "ns-mcp-server",
    serviceVersion: "1.0.0",
  },
  spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter()),
}))

/**
 * Ensure sensitive headers are redacted in tracing / logs
 */
const RedactedHeadersLayer = Layer.fiberRefLocallyScopedWith(
  Headers.currentRedactedNames,
  (names) => [...names, "ocp-apim-subscription-key", /ocp-apim-subscription-key/i],
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
 * - Tracing: OpenTelemetry with console span exporter
 */
export const AppLayer = StationServiceLive.pipe(
  Layer.provideMerge(NsApiServiceLive),
  Layer.provideMerge(NsHttpClientLive),
  Layer.provideMerge(RedactedHeadersLayer),
  Layer.provideMerge(TracingLayer),
  Layer.provideMerge(LoggingLayer),
  Layer.provideMerge(AppConfigLive),
  Layer.provide(FetchHttpClient.layer)
)

/**
 * Creates a ManagedRuntime for executing Effect programs with the full application context
 */
export const AppRuntime = ManagedRuntime.make(AppLayer)
