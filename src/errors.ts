/**
 * Typed error definitions using Effect's Data.TaggedError
 */

import { Data } from "effect";

/**
 * Error thrown when NS API request fails
 */
export class NsApiError extends Data.TaggedError("NsApiError")<{
  readonly status?: number | undefined;
  readonly message: string;
  readonly endpoint: string;
}> {}

/**
 * Error thrown when station lookup fails
 */
export class StationNotFoundError extends Data.TaggedError(
  "StationNotFoundError",
)<{
  readonly stationName: string;
  readonly message: string;
}> {}

/**
 * Error thrown when response parsing fails
 */
export class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string;
  readonly key: string;
}> {}
