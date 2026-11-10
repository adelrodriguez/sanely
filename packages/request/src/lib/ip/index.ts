import type { Range } from "#lib/address/range.ts"
import type { RequestLike } from "#lib/request/index.ts"
import { isGlobal } from "#lib/address/global.ts"
import { format, parseHost } from "#lib/address/index.ts"
import { contains, parseRange } from "#lib/address/range.ts"
import { readHeader } from "#lib/request/index.ts"

// How each kind of header writes addresses, split into candidates in the order to try them.
const CANDIDATES = {
  // Comma-separated addresses that each proxy appends to. The walk starts from the right, where
  // the nearest proxy wrote, because a client can write anything on the left.
  list: (value: string) => value.split(",").toReversed(),
  // One address, which can carry a port or an IPv6 zone.
  single: (value: string) => [value],
  // One address followed by the source port, which can be unbracketed even for IPv6.
  "with-port": (value: string) => [value.replace(/:\d+$/, "")],
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
  { format: "single", header: "forwarded" },
  { format: "single", header: "x-appengine-user-ip" },
]

/**
 * A hosting platform whose headers `ip` can trust.
 */
export type IpPlatform = keyof typeof PLATFORMS

export interface IpOptions {
  /**
   * The platform the app runs on. `ip` then reads only the headers that platform sets, and ignores
   * the common forwarding headers, which a client can forge.
   */
  readonly platform?: IpPlatform | undefined
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
 *
 * @returns The client's address, or `undefined` when the request has no public address.
 */
export function ip(request: RequestLike, options: IpOptions = {}): string | undefined {
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

  // Behind a platform, the connection comes from the platform's edge, so its headers come first.
  // Without one, the connection comes first, because a client can forge the common headers.
  const candidates =
    options.platform === undefined
      ? [...fromConnection, ...fromHeaders(COMMON)]
      : [...fromHeaders(PLATFORMS[options.platform]), ...fromConnection]

  for (const candidate of candidates) {
    const client = parseClient(candidate, proxies)
    if (client !== undefined) return client
  }

  return undefined
}
