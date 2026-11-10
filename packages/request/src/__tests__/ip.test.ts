import { describe, expect, it } from "vitest"
import type { IpOptions, IpPlatform, RequestLike } from "#index.ts"
import { ip } from "#index.ts"

// Calls `ip` without a platform unless the options name one.
function find(request: RequestLike, options: Partial<IpOptions> = {}) {
  return ip(request, { platform: "none", ...options })
}

function headers(entries: Record<string, string>): RequestLike {
  return { headers: new Headers(entries) }
}

// Addresses that are never a client on the public internet.
const NOT_GLOBAL = [
  ["this network", "0.1.2.3"],
  ["unspecified IPv4", "0.0.0.0"],
  ["private 10/8", "10.1.1.1"],
  ["shared address space", "100.127.255.255"],
  ["loopback", "127.0.0.1"],
  ["link local", "169.254.255.255"],
  ["private 172.16/12", "172.18.1.1"],
  ["IETF protocol assignments", "192.0.0.1"],
  ["documentation 192.0.2/24", "192.0.2.1"],
  ["private 192.168/16", "192.168.1.1"],
  ["benchmarking", "198.19.255.255"],
  ["documentation 198.51.100/24", "198.51.100.1"],
  ["documentation 203.0.113/24", "203.0.113.1"],
  ["reserved", "240.0.0.0"],
  ["broadcast", "255.255.255.255"],
  ["unspecified IPv6", "::"],
  ["IPv6 loopback", "::1"],
  ["IPv4-mapped", "::ffff:127.0.0.1"],
  ["local IPv4-IPv6 translation", "64:ff9b:1::"],
  ["discard only", "100::"],
  ["IPv6 benchmarking", "2001:2::"],
  ["IPv6 documentation", "2001:db8::"],
  ["unique local", "fc02::"],
  ["IPv6 link local", "fe80::"],
] as const

const MALFORMED = [
  ["three octets", "12.3.4"],
  ["five octets", "1.2.3.4.5"],
  ["a four-digit octet", "1111.2.3.4"],
  ["an octet over 255", "1.1.1.256"],
  ["a leading zero", "1.02.3.4"],
  ["an IPv6 address that ends early", "ffff:ffff:"],
  ["nine IPv6 groups", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"],
  ["two compressions", "1::2::3"],
  ["an embedded IPv4 address before the end", "1.2.3.4::"],
  ["a word", "unknown"],
] as const

// Public addresses, including the globally reachable exceptions inside 2001::/23, and how `ip` writes them.
const GLOBAL = [
  ["IPv4", "1.1.1.1", "1.1.1.1"],
  ["IPv6", "::abcd:c00a:2ff", "::abcd:c00a:2ff"],
  ["Port Control Protocol anycast", "2001:1::1", "2001:1::1"],
  ["TURN anycast", "2001:1::2", "2001:1::2"],
  ["AMT", "2001:3::", "2001:3::"],
  ["AS112-v6", "2001:4:112::", "2001:4:112::"],
  ["ORCHIDv2", "2001:20::", "2001:20::"],
  ["an IPv4 address with a port", "1.1.1.1:443", "1.1.1.1"],
  ["a bracketed IPv6 address with a port", "[2606:4700::1]:443", "2606:4700::1"],
  ["an IPv6 address with a zone", "::abcd:c00a:2ff%1", "::abcd:c00a:2ff"],
  ["padding", " 1.1.1.1 ", "1.1.1.1"],
] as const

// Each place `ip` finds an address, as a function that puts one there.
const FIELDS = [
  ["request.ip", (value: string): RequestLike => ({ headers: new Headers(), ip: value })],
  [
    "socket.remoteAddress",
    (value: string): RequestLike => ({ headers: new Headers(), socket: { remoteAddress: value } }),
  ],
  [
    "info.remoteAddress",
    (value: string): RequestLike => ({ headers: new Headers(), info: { remoteAddress: value } }),
  ],
  [
    "requestContext.identity.sourceIp",
    (value: string): RequestLike => ({
      headers: new Headers(),
      requestContext: { identity: { sourceIp: value } },
    }),
  ],
  ["X-Forwarded-For", (value: string) => headers({ "x-forwarded-for": value })],
] as const

describe.each(FIELDS)("ip from %s", (_, place) => {
  it.each(NOT_GLOBAL)("skips a %s address", (_name, address) => {
    expect(find(place(address))).toBeUndefined()
  })

  it.each(MALFORMED)("skips %s", (_name, text) => {
    expect(find(place(text))).toBeUndefined()
  })

  it.each(GLOBAL)("returns %s", (_name, text, expected) => {
    expect(find(place(text))).toBe(expected)
  })

  it("skips a trusted proxy given as an address", () => {
    expect(find(place("1.1.1.1"), { proxies: ["1.1.1.1"] })).toBeUndefined()
    expect(find(place("::abcd:c00a:2ff"), { proxies: ["::abcd:c00a:2ff"] })).toBeUndefined()
  })

  it("skips a trusted proxy inside a range", () => {
    expect(find(place("1.1.1.1"), { proxies: ["1.1.1.0/24"] })).toBeUndefined()
    expect(find(place("::abcd:c00a:2ff"), { proxies: ["::abcd:0:0/96"] })).toBeUndefined()
  })

  it("returns an address that no proxy matches", () => {
    expect(find(place("1.1.1.1"), { proxies: ["1.1.1.2", "1.1.2.0/24"] })).toBe("1.1.1.1")
    expect(find(place("::abcd:c00a:2ff"), { proxies: ["::abcd:c00a:2fa/128"] })).toBe(
      "::abcd:c00a:2ff"
    )
  })
})

describe("ip", () => {
  it("returns undefined for a request with no address", () => {
    expect(find(headers({}))).toBeUndefined()
  })

  it("ignores a non-string request.ip", () => {
    expect(find({ headers: new Headers(), ip: ["1", "1", "1", "1"] })).toBeUndefined()
  })

  it("writes IPv6 addresses in canonical form, so one address has one spelling", () => {
    expect(find(headers({ "x-real-ip": "2606:4700:0000:0000:0000:0000:0000:0001" }))).toBe(
      "2606:4700::1"
    )
    expect(find(headers({ "x-real-ip": "2606:4700:0:1:0:0:1:1" }))).toBe("2606:4700:0:1::1:1")
    expect(find(headers({ "x-real-ip": "2606:4700:0:0:1:0:0:1" }))).toBe("2606:4700::1:0:0:1")
    expect(find(headers({ "x-real-ip": "2606:4700:1:1:1:1:1:1" }))).toBe("2606:4700:1:1:1:1:1:1")
    expect(find(headers({ "x-real-ip": "2606:4700:0:1:1:1:1:1" }))).toBe("2606:4700:0:1:1:1:1:1")
    expect(find(headers({ "x-real-ip": "64:FF9B::C000:221" }))).toBe("64:ff9b::c000:221")
    expect(find(headers({ "x-real-ip": "64:ff9b::192.0.2.33" }))).toBe("64:ff9b::c000:221")
  })

  it("prefers the connection's address to any header", () => {
    const request = {
      headers: new Headers({ "x-forwarded-for": "2.2.2.2" }),
      socket: { remoteAddress: "1.1.1.1" },
    }

    expect(find(request)).toBe("1.1.1.1")
  })

  it("reads headers when the connection comes from a private proxy", () => {
    const request = {
      headers: new Headers({ "x-forwarded-for": "2.2.2.2" }),
      socket: { remoteAddress: "10.0.0.1" },
    }

    expect(find(request)).toBe("2.2.2.2")
  })

  it("reads a Node.js header record, joining repeated values", () => {
    expect(find({ headers: { "x-real-ip": "1.1.1.1" } })).toBe("1.1.1.1")
    expect(find({ headers: { "x-forwarded-for": ["1.1.1.1", "2.2.2.2", "3.3.3.3"] } })).toBe(
      "3.3.3.3"
    )
  })

  it("throws a TypeError for a proxy that is not an address or a range", () => {
    for (const proxy of ["", "proxy", "1.1.1.1/33", "::/129", "1.1.1.1/8/8", "1.1.1.1/a"]) {
      expect(() => find(headers({}), { proxies: [proxy] })).toThrow(TypeError)
    }
  })
})

describe("ip from X-Forwarded-For", () => {
  it.each([
    ["the rightmost public IPv4 address", "1.1.1.1, 2.2.2.2, 3.3.3.3", "3.3.3.3", []],
    ["the rightmost public IPv6 address", "e123::, 3.3.3.3, abcd::", "abcd::", []],
    ["past an unknown entry", "1.1.1.1, 3.3.3.3, unknown", "3.3.3.3", []],
    ["past a private address", "1.1.1.1, 3.3.3.3, 127.0.0.1", "3.3.3.3", []],
    ["past a private IPv6 address", "e123::, abcd::, ::1", "abcd::", []],
    ["past a trusted proxy", "1.1.1.1, 2.2.2.2, 3.3.3.3", "2.2.2.2", ["3.3.3.3"]],
    ["past an IPv6 trusted proxy", "e123::, 3.3.3.3, abcd::", "3.3.3.3", ["abcd::"]],
    [
      "past several trusted proxies",
      "1.1.1.1, 2.2.2.2, 3.3.3.3",
      "1.1.1.1",
      ["3.3.3.3", "2.2.2.2"],
    ],
    ["past a trusted range", "1.1.1.1, 2.2.2.2, 3.3.3.3", "1.1.1.1", ["2.0.0.0/7"]],
  ] as const)("returns %s", (_name, value, expected, proxies) => {
    expect(find(headers({ "x-forwarded-for": value }), { proxies })).toBe(expected)
  })

  it("comes before the other common headers", () => {
    const request = headers({
      "do-connecting-ip": "1.1.1.1",
      "fastly-client-ip": "1.1.1.1",
      "x-client-ip": "1.1.1.1",
      "x-forwarded-for": "2.2.2.2, 3.3.3.3",
    })

    expect(find(request)).toBe("3.3.3.3")
  })
})

describe("ip from Forwarded", () => {
  it.each([
    ["one element", "for=1.1.1.1;proto=https", "1.1.1.1"],
    ["the rightmost element", "for=1.1.1.1, for=2.2.2.2;by=10.0.0.1", "2.2.2.2"],
    ["a quoted IPv6 address with a port", 'for="[2606:4700::1]:443"', "2606:4700::1"],
    ["a parameter name in any case", "proto=https;For=1.1.1.1", "1.1.1.1"],
    ["past an obfuscated identifier", "for=1.1.1.1, for=_hidden", "1.1.1.1"],
    ["past an unknown client", "for=1.1.1.1, for=unknown", "1.1.1.1"],
    ["past a private address", 'for=1.1.1.1, for="10.0.0.1"', "1.1.1.1"],
  ])("returns %s", (_name, value, expected) => {
    expect(find(headers({ forwarded: value }))).toBe(expected)
  })

  it("ignores an element without a for parameter", () => {
    expect(find(headers({ forwarded: "by=1.1.1.1;proto=https" }))).toBeUndefined()
  })
})

describe("ip without a platform", () => {
  it.each([
    "x-client-ip",
    "do-connecting-ip",
    "fastly-client-ip",
    "true-client-ip",
    "x-real-ip",
    "x-cluster-client-ip",
    "x-forwarded",
    "forwarded-for",
    "x-appengine-user-ip",
  ])("reads %s", (header) => {
    expect(find(headers({ [header]: "1.1.1.1" }))).toBe("1.1.1.1")
  })

  it.each(["cf-connecting-ip", "cf-connecting-ipv6", "fly-client-ip", "x-vercel-forwarded-for"])(
    "ignores the platform header %s",
    (header) => {
      expect(find(headers({ [header]: "1.1.1.1" }))).toBeUndefined()
    }
  )
})

// Each platform's headers in the order it reads them, with the address each one holds.
const PLATFORMS: ReadonlyArray<readonly [IpPlatform, Record<string, string>, string]> = [
  ["app-engine", { "x-appengine-user-ip": "1.1.1.1" }, "1.1.1.1"],
  ["cloudflare", { "cf-connecting-ipv6": "abcd::" }, "abcd::"],
  ["cloudflare", { "cf-connecting-ip": "1.1.1.1" }, "1.1.1.1"],
  ["cloudfront", { "cloudfront-viewer-address": "1.1.1.1:46532" }, "1.1.1.1"],
  ["cloudfront", { "cloudfront-viewer-address": "2606:4700::1:443" }, "2606:4700::1"],
  ["cloudfront", { "cloudfront-viewer-address": "[2606:4700::1]:443" }, "2606:4700::1"],
  ["firebase", { "x-fah-client-ip": "1.1.1.1" }, "1.1.1.1"],
  ["firebase", { "x-forwarded-for": "1.1.1.1, 2.2.2.2" }, "2.2.2.2"],
  ["fly-io", { "fly-client-ip": "1.1.1.1" }, "1.1.1.1"],
  ["render", { "true-client-ip": "1.1.1.1" }, "1.1.1.1"],
  ["vercel", { "x-real-ip": "1.1.1.1" }, "1.1.1.1"],
  ["vercel", { "x-vercel-forwarded-for": "1.1.1.1, 2.2.2.2" }, "2.2.2.2"],
  ["vercel", { "x-forwarded-for": "1.1.1.1, 2.2.2.2" }, "2.2.2.2"],
]

// A header that every platform ignores, and that the common headers would read.
const FORGED = { "x-client-ip": "9.9.9.9" }

describe("ip with a platform", () => {
  it.each(PLATFORMS)("%s reads %o", (platform, entries, expected) => {
    expect(find(headers(entries), { platform })).toBe(expected)
    expect(find(headers({ ...FORGED, ...entries }), { platform })).toBe(expected)
  })

  it.each([...new Set(PLATFORMS.map(([platform]) => platform))])(
    "%s ignores every other header",
    (platform) => {
      expect(find(headers(FORGED), { platform })).toBeUndefined()
    }
  )

  it("reads the platform's headers in order", () => {
    const options: IpOptions = { platform: "cloudflare" }

    expect(
      find(headers({ "cf-connecting-ip": "1.1.1.1", "cf-connecting-ipv6": "abcd::" }), options)
    ).toBe("abcd::")
    expect(
      find(headers({ "cf-connecting-ip": "1.1.1.1", "cf-connecting-ipv6": "::1" }), options)
    ).toBe("1.1.1.1")
  })

  it("prefers the platform's headers to the connection, which is the platform's edge", () => {
    const request = {
      headers: new Headers({ "cf-connecting-ip": "1.1.1.1" }),
      socket: { remoteAddress: "104.16.0.1" },
    }

    expect(find(request, { platform: "cloudflare" })).toBe("1.1.1.1")
  })

  it("falls back to the connection when the platform's headers are missing", () => {
    const request = { headers: new Headers(), socket: { remoteAddress: "1.1.1.1" } }

    expect(find(request, { platform: "cloudflare" })).toBe("1.1.1.1")
  })

  it("skips trusted proxies in the platform's headers", () => {
    expect(
      find(headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), {
        platform: "firebase",
        proxies: ["2.2.2.2"],
      })
    ).toBe("1.1.1.1")
  })
})

describe("ip options", () => {
  it("throws a TypeError naming the problem when the platform is missing", () => {
    const options = { platform: process.env["SANELY_UNSET_PLATFORM"] } as unknown as IpOptions

    expect(() => ip(headers({ "x-client-ip": "9.9.9.9" }), options)).toThrow(
      new TypeError(
        'Unknown platform undefined. Expected "none" or one of: app-engine, cloudflare, cloudfront, firebase, fly-io, render, vercel'
      )
    )
  })

  it("throws a TypeError naming the problem for an unknown platform", () => {
    const options = { platform: "netlify" } as unknown as IpOptions

    expect(() => ip(headers({}), options)).toThrow(/^Unknown platform "netlify"/)
  })
})
