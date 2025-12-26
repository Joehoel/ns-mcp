/**
 * Effect Schema definitions for NS API responses
 */

import * as Schema from "effect/Schema"

// --- Departure Schemas (V2 API) ---

export const Departure = Schema.Struct({
  plannedDateTime: Schema.String,
  direction: Schema.String,
  trainCategory: Schema.String,
  plannedTrack: Schema.String,
})

export const DeparturesResponse = Schema.Struct({
  payload: Schema.Struct({
    departures: Schema.Array(Departure),
  }),
})

// --- Trip Schemas (V3 Trips API) ---

export const TripLegOrigin = Schema.Struct({
  name: Schema.optional(Schema.String),
  plannedDateTime: Schema.optional(Schema.String),
  plannedTrack: Schema.optional(Schema.String),
})

export const TripLegDestination = Schema.Struct({
  name: Schema.optional(Schema.String),
  plannedDateTime: Schema.optional(Schema.String),
})

export const TripLegProduct = Schema.Struct({
  longCategoryName: Schema.optional(Schema.String),
})

export const TripLeg = Schema.Struct({
  origin: TripLegOrigin,
  destination: TripLegDestination,
  product: Schema.optional(TripLegProduct),
})

export const Trip = Schema.Struct({
  legs: Schema.Array(TripLeg),
})

export const TripsResponse = Schema.Struct({
  trips: Schema.Array(Trip),
})

// --- Inferred Types ---

export type Departure = Schema.Schema.Type<typeof Departure>
export type DeparturesResponse = Schema.Schema.Type<typeof DeparturesResponse>
export type TripLeg = Schema.Schema.Type<typeof TripLeg>
export type Trip = Schema.Schema.Type<typeof Trip>
export type TripsResponse = Schema.Schema.Type<typeof TripsResponse>
