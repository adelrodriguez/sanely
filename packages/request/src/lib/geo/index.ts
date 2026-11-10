import type { RequestLike } from "#lib/request/index.ts"
import { checkPlatform, readHeader } from "#lib/request/index.ts"

/**
 * Where the client of a request is, as its platform reports it. Each field is `undefined` when
 * unknown.
 */
export interface Geo {
  /**
   * City name, such as `San Francisco`.
   */
  readonly city: string | undefined
  /**
   * Continent code: `AF`, `AN`, `AS`, `EU`, `NA`, `OC`, or `SA`.
   */
  readonly continent: string | undefined
  /**
   * ISO 3166-1 alpha-2 country code, such as `US`.
   */
  readonly country: string | undefined
  readonly latitude: number | undefined
  readonly longitude: number | undefined
  readonly postalCode: string | undefined
  /**
   * ISO 3166-2 code of the first-level subdivision without the country, such as `CA` for
   * California.
   */
  readonly region: string | undefined
  /**
   * IANA time zone name, such as `America/Los_Angeles`.
   */
  readonly timezone: string | undefined
}

// The header that holds each field. App Engine sends both coordinates in one header as `lat,long`.
type FieldHeaders = Partial<Record<keyof Geo | "coordinates", string>>

// The headers each platform sets for every request, replacing any value the client sent.
const PLATFORMS = {
  "app-engine": {
    city: "x-appengine-city",
    coordinates: "x-appengine-citylatlong",
    country: "x-appengine-country",
    region: "x-appengine-region",
  },
  cloudflare: {
    city: "cf-ipcity",
    continent: "cf-ipcontinent",
    country: "cf-ipcountry",
    latitude: "cf-iplatitude",
    longitude: "cf-iplongitude",
    postalCode: "cf-postal-code",
    region: "cf-region-code",
    timezone: "cf-timezone",
  },
  cloudfront: {
    city: "cloudfront-viewer-city",
    country: "cloudfront-viewer-country",
    latitude: "cloudfront-viewer-latitude",
    longitude: "cloudfront-viewer-longitude",
    postalCode: "cloudfront-viewer-postal-code",
    region: "cloudfront-viewer-country-region",
    timezone: "cloudfront-viewer-time-zone",
  },
  vercel: {
    city: "x-vercel-ip-city",
    continent: "x-vercel-ip-continent",
    country: "x-vercel-ip-country",
    latitude: "x-vercel-ip-latitude",
    longitude: "x-vercel-ip-longitude",
    postalCode: "x-vercel-ip-postal-code",
    region: "x-vercel-ip-country-region",
    timezone: "x-vercel-ip-timezone",
  },
} as const satisfies Record<string, FieldHeaders>

/**
 * A hosting platform that reports where the client is.
 */
export type GeoPlatform = keyof typeof PLATFORMS

export interface GeoOptions {
  /**
   * The platform the app runs on. It is required because only the platform's own headers are
   * trustworthy. A client can send any other header.
   *
   * @throws {TypeError} When the platform is not one of these, such as an unset environment
   *   variable.
   */
  readonly platform: GeoPlatform
}

// Two-letter codes, which also rejects Cloudflare's Tor marker, `T1`.
const CODE = /^[A-Z]{2}$/
// Cloudflare and App Engine send these for an unknown country.
const UNKNOWN_CODES = new Set(["XX", "ZZ"])
const REGION = /^[\dA-Z]{1,3}$/

function parseCode(value: string | undefined) {
  const code = value?.toUpperCase()
  return code !== undefined && CODE.test(code) && !UNKNOWN_CODES.has(code) ? code : undefined
}

function parseRegion(value: string | undefined) {
  const region = value?.toUpperCase()
  return region !== undefined && REGION.test(region) ? region : undefined
}

// Vercel and CloudFront percent-encode city names. App Engine sends `?` for an unknown city.
function parseCity(value: string | undefined) {
  if (value === undefined || value === "?") return

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseCoordinate(value: string | undefined, limit: number) {
  const coordinate = value === undefined || value.trim() === "" ? Number.NaN : Number(value)
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate : undefined
}

/**
 * Reads where the client of a request is from the headers its platform sets.
 *
 * @example
 *   import { geo } from "@sanely/request"
 *
 *   geo(request, { platform: "vercel" }).country // "US"
 *
 * @returns The location. A field is `undefined` when the platform did not report it.
 */
export function geo(request: RequestLike, options: GeoOptions): Geo {
  const { platform } = options
  checkPlatform(platform, PLATFORMS, "one of: ")

  const headers: FieldHeaders = PLATFORMS[platform]
  const read = (field: keyof FieldHeaders) => {
    const name = headers[field]
    return name === undefined ? undefined : readHeader(request, name)
  }

  const [latitudeText, longitudeText] = read("coordinates")?.split(",") ?? [
    read("latitude"),
    read("longitude"),
  ]
  const latitude = parseCoordinate(latitudeText, 90)
  const longitude = parseCoordinate(longitudeText, 180)
  // Platforms report 0,0 when they cannot place the client.
  const located = latitude !== 0 || longitude !== 0

  return {
    city: parseCity(read("city")),
    continent: parseCode(read("continent")),
    country: parseCode(read("country")),
    latitude: located ? latitude : undefined,
    longitude: located ? longitude : undefined,
    postalCode: read("postalCode"),
    region: parseRegion(read("region")),
    timezone: read("timezone"),
  }
}
