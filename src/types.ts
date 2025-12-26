/**
 * Transportation product types for NS API
 */

/**
 * Transportation types supported by the NS API
 * These are used to filter trip results by mode of transport
 *
 * Note: For trips API, use disabledTransportModalities to EXCLUDE types
 * For departures API, client-side filtering is required (API doesn't support filtering)
 */
export const TransportationType = {
  TRAIN: "TRAIN",
  BUS: "BUS",
  TRAM: "TRAM",
  METRO: "METRO",
  FERRY: "FERRY",
  WALK: "WALK",
  BIKE: "BIKE",
  CAR: "CAR",
  TAXI: "TAXI",
  SHARED_MODALITY: "SHARED_MODALITY",
  UNKNOWN: "UNKNOWN",
} as const;

export type TransportationType =
  (typeof TransportationType)[keyof typeof TransportationType];

/**
 * All available transportation types
 */
export const ALL_TRANSPORTATION_TYPES = Object.values(TransportationType);

/**
 * User-friendly Dutch display names for transportation types
 */
export const TRANSPORTATION_TYPE_DISPLAY_NAMES: Record<
  TransportationType,
  string
> = {
  TRAIN: "Trein",
  BUS: "Bus",
  TRAM: "Tram",
  METRO: "Metro",
  FERRY: "Veerboot",
  WALK: "Lopen",
  BIKE: "Fiets",
  CAR: "Auto",
  TAXI: "Taxi",
  SHARED_MODALITY: "Gedeeld vervoer",
  UNKNOWN: "Onbekend",
};

/**
 * Map NS API product category names to our transportation types
 * This is used for client-side filtering
 */
export const PRODUCT_CATEGORY_TO_TYPE: Record<string, TransportationType> = {
  // Trains
  Intercity: "TRAIN",
  "Intercity direct": "TRAIN",
  Sprinter: "TRAIN",
  Sneltrein: "TRAIN",
  Stoptrein: "TRAIN",

  // Other transportation
  Bus: "BUS",
  Metro: "METRO",
  Tram: "TRAM",
  Veerboot: "FERRY",
  Ferry: "FERRY",
};

/**
 * Check if a product matches any of the requested transportation types
 * Returns true if it should be included in results
 */
export function matchesTransportationType(
  productName: string | undefined,
  requestedTypes: TransportationType[] | undefined,
): boolean {
  // If no filter specified, match everything
  if (!requestedTypes || requestedTypes.length === 0) {
    return true;
  }

  // If no product name, include it (better to show too much than too little)
  if (!productName) {
    return true;
  }

  // Check if the product matches any requested type
  const productType = PRODUCT_CATEGORY_TO_TYPE[productName];

  if (productType) {
    return requestedTypes.includes(productType);
  }

  // If we don't recognize the category, check if it contains keywords
  const lowerProductName = productName.toLowerCase();

  for (const type of requestedTypes) {
    const keyword = TRANSPORTATION_TYPE_DISPLAY_NAMES[type].toLowerCase();
    if (lowerProductName.includes(keyword)) {
      return true;
    }
  }

  // Default: include unknown types (better to show too much)
  return true;
}
