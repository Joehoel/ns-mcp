/**
 * Application configuration using Effect Config
 */

import { Config, Context, Effect, Layer, Redacted } from "effect"

export class AppConfig extends Context.Tag("AppConfig")<
  AppConfig,
  {
    readonly nsApiKey: string
    readonly port: number
  }
>() {}

export const AppConfigLive = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const nsApiKey = yield* Config.redacted("NS_API_KEY")
    const port = yield* Config.number("PORT").pipe(Config.withDefault(3000))

    return {
      nsApiKey: Redacted.value(nsApiKey),
      port,
    }
  })
)
