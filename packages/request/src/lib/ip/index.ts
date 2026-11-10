import type { Range } from "#lib/address/range.ts"
import type { RequestLike } from "#lib/request/index.ts"
import { isGlobal } from "#lib/address/global.ts"
import { format, parseHost } from "#lib/address/index.ts"
import { contains, parseRange } from "#lib/address/range.ts"
import { checkPlatform, readHeader } from "#lib/request/index.ts"

// The `for` parameter of one RFC 7239 element, such as `for=192.0.2.60` or `for="[2001:db8::1]:443"`.
const FORWARDED_FOR = /(?:^|;)\s*for=("?)([^";]*)\1\s*(?:;|$)/i

// An address, then a colon and a port of up to five digits.
const WITH_PORT = /^(.+):(\d{1,5})$/

// How each kind of header writes addresses, split into candidates in the order to try them.
const CANDIDATES = {
  // RFC 7239 elements that each proxy appends to, read from the right like `list`. An element's
  // `for` parameter holds the address the proxy received the request from.
  forwarded: (value: string) =>
    value
      .split(",")
      .toReversed()
      .flatMap((element) => FORWARDED_FOR.exec(element.trim())?.slice(2, 3) ?? []),
  // Comma-separated addresses that each proxy appends to. The walk starts from the right, where
  // the nearest proxy wrote, because a client can write anything on the left.
  list: (value: string) => value.split(",").toReversed(),
  // One address, which can carry a port or an IPv6 zone.
  single: (value: string) => [value],
  // One address followed by the source port, unbracketed even for IPv6. CloudFront documents the
  // port as always present, so a value without one is skipped. An unbracketed IPv6 address that
  // lacked the port anyway would lose its last group to it, if that group is all digits.
  "with-port": (value: string) => {
    const [, address, port] = WITH_PORT.exec(value) ?? []
    return address !== undefined && Number(port) <= 65_535 ? [address] : []
  },
} as const

interface Source {
  readonly format: keyof typeof CANDIDATES
  readonly header: string
}

// The headers each platform sets for every request, replacing any value the client sent. With a
// platform, `ip` reads only these headers, so a client cannot forge the result.
const PLATFORMS = {
  "app-engine": [{ format: "single", header: "x-appengine-user-ip" }],
  cloudflare: [
    { format: "single", header: "cf-connecting-ipv6" },
    { format: "single", header: "cf-connecting-ip" },
  ],
  cloudfront: [{ format: "with-port", header: "cloudfront-viewer-address" }],
  firebase: [
    { format: "single", header: "x-fah-client-ip" },
    { format: "list", header: "x-forwarded-for" },
  ],
  "fly-io": [{ format: "single", header: "fly-client-ip" }],
  render: [{ format: "single", header: "true-client-ip" }],
  vercel: [
    { format: "single", header: "x-real-ip" },
    { format: "list", header: "x-vercel-forwarded-for" },
    { format: "list", header: "x-forwarded-for" },
  ],
} as const satisfies Record<string, readonly Source[]>

// Headers that common proxies, load balancers, and CDNs set, in the order `ip` reads them without a
// platform. A client can forge any of them unless a proxy in front of the app replaces it.
const COMMON: readonly Source[] = [
  { format: "list", header: "x-forwarded-for" },
  { format: "single", header: "x-client-ip" },
  { format: "single", header: "do-connecting-ip" },
  { format: "single", header: "fastly-client-ip" },
  { format: "single", header: "true-client-ip" },
  { format: "single", header: "x-real-ip" },
  { format: "single", header: "x-cluster-client-ip" },
  { format: "single", header: "x-forwarded" },
  { format: "single", header: "forwarded-for" },
  { format: "forwarded", header: "forwarded" },
  { format: "single", header: "x-appengine-user-ip" },
]

/**
 * A hosting platform whose headers `ip` can trust.
 */
export type IpPlatform = keyof typeof PLATFORMS

export interface IpOptions {
  /**
   * The platform the app runs on. `ip` then reads only the headers that platform sets. Use `"none"`
   * when no platform sits in front of the app: `ip` then reads the connection first, and falls back
   * to the common forwarding headers, which a client can forge.
   *
   * @throws {TypeError} When the platform is not one of these, such as an unset environment
   *   variable.
   */
  readonly platform: IpPlatform | "none"
  /**
   * Addresses and CIDR ranges of proxies in front of the app, such as `10.0.0.0/8`. `ip` skips them
   * while it looks for the client.
   *
   * @throws {TypeError} When an entry is not an IP address or a CIDR range.
   */
  readonly proxies?: readonly string[] | undefined
}

function parseProxy(text: string) {
  const range = parseRange(text)
  if (!range)
    throw new TypeError(
      `Invalid proxy ${JSON.stringify(text)}: expected an IP address or CIDR range`
    )

  return range
}

function parseClient(candidate: unknown, proxies: readonly Range[]) {
  if (typeof candidate !== "string") return

  const address = parseHost(candidate.trim())
  if (!address || !isGlobal(address)) return
  if (proxies.some((range) => contains(range, address))) return

  return format(address)
}

/**
 * Finds the IP address of the client that sent a request. It skips private, reserved, and
 * trusted-proxy addresses, and returns the address in its canonical form.
 *
 * @example
 *   import { ip } from "@sanely/request"
 *
 *   ip(request, { platform: "vercel" }) // "203.0.113.9"
 *   ip(request, { platform: "none", proxies: ["10.0.0.0/8"] }) // "198.51.100.7"
 *
 * @returns The client's address, or `undefined` when the request has no public address.
 */
export function ip(request: RequestLike, options: IpOptions): string | undefined {
  const proxies = (options.proxies ?? []).map((text) => parseProxy(text))
  const fromHeaders = (sources: readonly Source[]) =>
    sources.flatMap((source) => {
      const value = readHeader(request, source.header)
      return value === undefined ? [] : CANDIDATES[source.format](value)
    })
  const fromConnection = [
    request.ip,
    request.socket?.remoteAddress,
    request.info?.remoteAddress,
    request.requestContext?.identity?.sourceIp,
  ]

  // Without a platform, the connection comes first, because a client can forge the common
  // headers. Behind a platform, the connection comes from the platform's edge, so its headers come
  // first.
  const { platform } = options
  if (platform === "none") return findClient([...fromConnection, ...fromHeaders(COMMON)], proxies)

  checkPlatform(platform, PLATFORMS, '"none" or one of: ')
  return findClient([...fromHeaders(PLATFORMS[platform]), ...fromConnection], proxies)
}

// Returns the first candidate that is a client, in the order given.
function findClient(candidates: readonly unknown[], proxies: readonly Range[]) {
  return candidates
    .map((candidate) => parseClient(candidate, proxies))
    .find((client) => client !== undefined)
}
