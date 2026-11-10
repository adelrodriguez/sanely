import { describe, expect, it } from "vitest"
import type { Geo, GeoOptions, GeoPlatform } from "#index.ts"
import { geo } from "#index.ts"

function headers(entries: Record<string, string>) {
  return { headers: new Headers(entries) }
}

const UNKNOWN: Geo = {
  city: undefined,
  continent: undefined,
  country: undefined,
  latitude: undefined,
  longitude: undefined,
  postalCode: undefined,
  region: undefined,
  timezone: undefined,
}

// Each platform's headers for one location, and what `geo` reads from them.
const PLATFORMS: ReadonlyArray<readonly [GeoPlatform, Record<string, string>, Geo]> = [
  [
    "vercel",
    {
      "x-vercel-ip-city": "S%C3%A3o%20Paulo",
      "x-vercel-ip-continent": "SA",
      "x-vercel-ip-country": "BR",
      "x-vercel-ip-country-region": "SP",
      "x-vercel-ip-latitude": "-23.5475",
      "x-vercel-ip-longitude": "-46.6361",
      "x-vercel-ip-postal-code": "01000-000",
      "x-vercel-ip-timezone": "America/Sao_Paulo",
    },
    {
      city: "São Paulo",
      continent: "SA",
      country: "BR",
      latitude: -23.5475,
      longitude: -46.6361,
      postalCode: "01000-000",
      region: "SP",
      timezone: "America/Sao_Paulo",
    },
  ],
  [
    "cloudflare",
    {
      "cf-ipcity": "Lisbon",
      "cf-ipcontinent": "EU",
      "cf-ipcountry": "PT",
      "cf-iplatitude": "38.7167",
      "cf-iplongitude": "-9.1333",
      "cf-postal-code": "1100-148",
      "cf-region-code": "11",
      "cf-timezone": "Europe/Lisbon",
    },
    {
      city: "Lisbon",
      continent: "EU",
      country: "PT",
      latitude: 38.7167,
      longitude: -9.1333,
      postalCode: "1100-148",
      region: "11",
      timezone: "Europe/Lisbon",
    },
  ],
  [
    "cloudfront",
    {
      "cloudfront-viewer-city": "K%C3%B6ln",
      "cloudfront-viewer-country": "DE",
      "cloudfront-viewer-country-region": "NW",
      "cloudfront-viewer-latitude": "50.9333",
      "cloudfront-viewer-longitude": "6.95",
      "cloudfront-viewer-postal-code": "50667",
      "cloudfront-viewer-time-zone": "Europe/Berlin",
    },
    {
      city: "Köln",
      continent: undefined,
      country: "DE",
      latitude: 50.9333,
      longitude: 6.95,
      postalCode: "50667",
      region: "NW",
      timezone: "Europe/Berlin",
    },
  ],
  [
    "app-engine",
    {
      "x-appengine-city": "mountain view",
      "x-appengine-citylatlong": "37.386051,-122.083851",
      "x-appengine-country": "US",
      "x-appengine-region": "ca",
    },
    {
      ...UNKNOWN,
      city: "mountain view",
      country: "US",
      latitude: 37.386051,
      longitude: -122.083851,
      region: "CA",
    },
  ],
]

describe("geo", () => {
  it.each(PLATFORMS)("reads every field %s sends", (platform, entries, expected) => {
    expect(geo(headers(entries), { platform })).toEqual(expected)
  })

  it.each(PLATFORMS)("ignores the headers of other platforms on %s", (platform) => {
    const others = PLATFORMS.filter(([other]) => other !== platform).map(([, entries]) => entries)

    expect(
      geo(headers(Object.fromEntries(others.flatMap((entries) => Object.entries(entries)))), {
        platform,
      })
    ).toEqual(UNKNOWN)
  })

  it("returns every field as undefined when the platform sent nothing", () => {
    expect(geo(headers({}), { platform: "vercel" })).toEqual(UNKNOWN)
  })

  it("reads a Node.js header record", () => {
    expect(geo({ headers: { "cf-ipcountry": "PT" } }, { platform: "cloudflare" }).country).toBe(
      "PT"
    )
  })

  it.each([
    ["Cloudflare's unknown country", "XX"],
    ["Cloudflare's Tor marker", "T1"],
    ["App Engine's unknown country", "ZZ"],
    ["a three-letter code", "USA"],
    ["an empty value", ""],
  ])("reads %s as an unknown country", (_name, value) => {
    expect(
      geo(headers({ "cf-ipcountry": value }), { platform: "cloudflare" }).country
    ).toBeUndefined()
    expect(
      geo(headers({ "x-appengine-country": value }), { platform: "app-engine" }).country
    ).toBeUndefined()
  })

  it("uppercases country, continent, and region codes", () => {
    const request = headers({
      "x-vercel-ip-continent": "na",
      "x-vercel-ip-country": "us",
      "x-vercel-ip-country-region": "ca",
    })

    expect(geo(request, { platform: "vercel" })).toMatchObject({
      continent: "NA",
      country: "US",
      region: "CA",
    })
  })

  it("reads App Engine's unknown city and coordinates as unknown", () => {
    const request = headers({
      "x-appengine-city": "?",
      "x-appengine-citylatlong": "0.000000,0.000000",
    })

    expect(geo(request, { platform: "app-engine" })).toEqual(UNKNOWN)
  })

  it("keeps a city name that is not valid percent-encoding", () => {
    expect(geo(headers({ "x-vercel-ip-city": "100%" }), { platform: "vercel" }).city).toBe("100%")
  })

  it.each([
    ["not a number", "north", "east"],
    ["out of range", "91", "181"],
    ["blank", " ", " "],
  ])("reads coordinates that are %s as unknown", (_name, latitude, longitude) => {
    const request = headers({
      "x-vercel-ip-latitude": latitude,
      "x-vercel-ip-longitude": longitude,
    })

    expect(geo(request, { platform: "vercel" })).toMatchObject({
      latitude: undefined,
      longitude: undefined,
    })
  })

  it("throws a TypeError naming the problem for an unknown platform", () => {
    const options = { platform: "fly-io" } as unknown as GeoOptions

    expect(() => geo(headers({}), options)).toThrow(
      new TypeError(
        'Unknown platform "fly-io". Expected one of: app-engine, cloudflare, cloudfront, vercel'
      )
    )
  })
})
