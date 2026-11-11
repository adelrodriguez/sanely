import type { IncomingMessage } from "node:http"
import { describe, expectTypeOf, it } from "vitest"
import type {
  Continent,
  Coordinates,
  CountryCode,
  Geo,
  GeoPlatform,
  IpPlatform,
  Proxies,
  RegionCode,
} from "#index.ts"
import { geo, ip, parseProxies } from "#index.ts"

declare const request: Request
declare const incoming: IncomingMessage
declare function currencyOf(country: CountryCode): string

describe("ip", () => {
  it("returns a string or undefined", () => {
    expectTypeOf(ip(request, { platform: "none" })).toEqualTypeOf<string | undefined>()
  })

  it("accepts a Fetch request and a Node.js request", () => {
    ip(request, { platform: "vercel", proxies: parseProxies(["10.0.0.0/8"]) })
    ip(incoming, { platform: "none" })
  })

  it("takes proxies only from parseProxies, so a bad entry fails at startup", () => {
    expectTypeOf(parseProxies(["10.0.0.0/8"])).toEqualTypeOf<Proxies>()
    // @ts-expect-error -- raw strings must go through parseProxies first.
    ip(request, { platform: "none", proxies: ["10.0.0.0/8"] })
  })

  it("requires a platform, or an explicit none", () => {
    ip(request, { platform: "none" })
    // @ts-expect-error -- a missing platform must not silently trust forgeable headers.
    ip(request)
    // @ts-expect-error -- a missing platform must not silently trust forgeable headers.
    ip(request, { proxies: parseProxies([]) })
  })

  it("accepts only known platforms", () => {
    // @ts-expect-error -- "heroku" is not a platform.
    ip(request, { platform: "heroku" })
  })

  it("names every platform that sets a client IP header", () => {
    expectTypeOf<IpPlatform>().toEqualTypeOf<
      "app-engine" | "cloudflare" | "cloudfront" | "firebase" | "fly-io" | "render" | "vercel"
    >()
  })
})

describe("geo", () => {
  it("returns a location", () => {
    expectTypeOf(geo(request, { platform: "vercel" })).toEqualTypeOf<Geo>()
    expectTypeOf<Geo["coordinates"]>().toEqualTypeOf<Coordinates | undefined>()
    expectTypeOf<Coordinates>().toEqualTypeOf<{
      readonly latitude: number
      readonly longitude: number
    }>()
  })

  it("types each location code so one cannot stand in for another", () => {
    expectTypeOf<Geo["continent"]>().toEqualTypeOf<Continent | undefined>()
    expectTypeOf<Continent>().toEqualTypeOf<"AF" | "AN" | "AS" | "EU" | "NA" | "OC" | "SA">()
    expectTypeOf<Geo["country"]>().toEqualTypeOf<CountryCode | undefined>()
    expectTypeOf<Geo["region"]>().toEqualTypeOf<RegionCode | undefined>()
    expectTypeOf<CountryCode>().toExtend<string>()
    expectTypeOf<RegionCode>().toExtend<string>()
  })

  it("rejects a region code where a country code belongs", () => {
    const location = geo(request, { platform: "vercel" })

    if (location.country !== undefined) currencyOf(location.country)
    // @ts-expect-error -- "CA" as a region is California. As a country, it is Canada.
    if (location.region !== undefined) currencyOf(location.region)
    // @ts-expect-error -- a plain string is not a parsed country code.
    currencyOf("US")
  })

  it("accepts a Node.js request", () => {
    geo(incoming, { platform: "cloudflare" })
  })

  it("requires a platform", () => {
    // @ts-expect-error -- geo has no trustworthy headers without a platform.
    geo(request)
    // @ts-expect-error -- geo has no trustworthy headers without a platform.
    geo(request, {})
  })

  it("rejects platforms that send no location", () => {
    // @ts-expect-error -- Fly.io sends no location headers.
    geo(request, { platform: "fly-io" })
  })

  it("names every platform that sends a location", () => {
    expectTypeOf<GeoPlatform>().toEqualTypeOf<
      "app-engine" | "cloudflare" | "cloudfront" | "vercel"
    >()
  })

  it("shares one options object with ip", () => {
    const options = { platform: "vercel" } as const

    ip(request, options)
    geo(request, options)
  })
})
