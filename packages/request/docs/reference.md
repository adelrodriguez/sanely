# `@sanely/request` reference

The package has one entry point, `@sanely/request`. Every export is a named export.

## `ip`

```ts
function ip(request: RequestLike, options: IpOptions): string | undefined
```

Returns the IP address of the client that sent the request, or `undefined` when the request carries no public address.

```ts
import { ip } from "@sanely/request"

ip(request, { platform: "cloudflare" }) // "203.0.113.9"
ip(request, { platform: "none", proxies: ["10.0.0.0/8"] }) // "2606:4700::1"
ip(new Request("http://localhost"), { platform: "none" }) // undefined
```

`ip` checks these places in order and returns the first public address.

With `platform: "none"`, for an app with no platform in front of it:

1. The address that the runtime or framework reports: `request.ip`, `request.socket.remoteAddress`, `request.info.remoteAddress`, then `request.requestContext.identity.sourceIp`. A client cannot forge these.
2. The common forwarding headers: `X-Forwarded-For`, `X-Client-IP`, `DO-Connecting-IP`, `Fastly-Client-IP`, `True-Client-IP`, `X-Real-IP`, `X-Cluster-Client-IP`, `X-Forwarded`, `Forwarded-For`, `Forwarded`, then `X-Appengine-User-IP`. `ip` reads the `for` parameters of the standard `Forwarded` header from RFC 7239, such as `for=192.0.2.60;proto=https`.

With a platform:

1. The headers that platform sets, in the order of the table below. Behind a platform, the connection comes from the platform's edge, not the client.
2. The address that the runtime or framework reports, for requests that reach the app without passing through the platform.

`ip` skips these addresses:

- Private, loopback, link-local, documentation, benchmarking, and reserved addresses from the IANA special-purpose registries.
- Addresses that match an entry in `proxies`.
- Text that is not an IPv4 or IPv6 address. IPv4 octets with a leading zero are rejected, because some parsers read them as octal.

In a header that lists several addresses, such as `X-Forwarded-For` or `Forwarded`, `ip` reads from the right. Each proxy appends the address it received the request from, so the rightmost addresses come from proxies you control, and a client can write anything on the left.

`ip` drops a port, brackets, or an IPv6 zone, and writes IPv6 addresses in their canonical form from RFC 5952. One client always gets one spelling, so the result works as a rate-limit identity.

| `platform`     | Headers, in order                                        |
| -------------- | -------------------------------------------------------- |
| `"app-engine"` | `X-Appengine-User-IP`                                    |
| `"cloudflare"` | `CF-Connecting-IPv6`, `CF-Connecting-IP`                 |
| `"cloudfront"` | `CloudFront-Viewer-Address`                              |
| `"firebase"`   | `X-Fah-Client-IP`, `X-Forwarded-For`                     |
| `"fly-io"`     | `Fly-Client-IP`                                          |
| `"render"`     | `True-Client-IP`                                         |
| `"vercel"`     | `X-Real-IP`, `X-Vercel-Forwarded-For`, `X-Forwarded-For` |

CloudFront sends `CloudFront-Viewer-Address` only when an origin request policy includes it. The header holds the viewer's address and source port, such as `198.51.100.10:46532`. `ip` skips a value without a port.

### `IpOptions`

| Option     | Type                   | Default  | Description                                                                                           |
| ---------- | ---------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `platform` | `IpPlatform \| "none"` | Required | The platform the app runs on, or `"none"`. With a platform, `ip` reads only that platform's headers.  |
| `proxies`  | `readonly string[]`    | `[]`     | Addresses and CIDR ranges of your own proxies, such as `"10.0.0.0/8"`. `ip` skips matching addresses. |

`ip` throws a `TypeError` when `platform` is not `"none"` or a known platform, such as when it comes from an unset environment variable. It also throws one when an entry in `proxies` is not an IP address or a CIDR range.

`platform` is required so that a missing setting fails loudly instead of trusting headers that a client can forge.

## `geo`

```ts
function geo(request: RequestLike, options: GeoOptions): Geo
```

Returns where the client is, from the headers the platform sets. A field is `undefined` when the platform did not report it.

```ts
import { geo } from "@sanely/request"

geo(request, { platform: "vercel" })
// {
//   city: "San Francisco", continent: "NA", country: "US",
//   coordinates: { latitude: 37.7749, longitude: -122.4194 },
//   postalCode: "94107", region: "CA", timezone: "America/Los_Angeles",
// }
```

`platform` is required, and `geo` throws a `TypeError` for an unknown one. Location headers have no common form, and a client can send any header that its platform does not replace.

| Field         | Type          | Description                                                                                                                                            |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `city`        | `string`      | City name, percent-decoded.                                                                                                                            |
| `continent`   | `Continent`   | Continent code: `AF`, `AN`, `AS`, `EU`, `NA`, `OC`, or `SA`. Any other value reads as `undefined`.                                                     |
| `country`     | `CountryCode` | ISO 3166-1 alpha-2 country code, such as `US`.                                                                                                         |
| `coordinates` | `Coordinates` | `{ latitude, longitude }`, with the latitude between -90 and 90 and the longitude between -180 and 180. Both are present, or the field is `undefined`. |
| `postalCode`  | `string`      | Postal code near the client.                                                                                                                           |
| `region`      | `RegionCode`  | First-level ISO 3166-2 subdivision code without the country, such as `CA`.                                                                             |
| `timezone`    | `string`      | IANA time zone name, such as `America/Los_Angeles`.                                                                                                    |

`geo` reads platform markers for an unknown value as `undefined`: an unknown country (`XX` or `ZZ`), Cloudflare's Tor marker (`T1`), App Engine's `?` city, the coordinates `0,0`, and a pair with one coordinate missing or out of range.

| `platform`     | Fields                                                   | Setup                                                                                        |
| -------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `"app-engine"` | `country`, `region`, `city`, `coordinates`               | None.                                                                                        |
| `"cloudflare"` | `country`. The others need the visitor location headers. | Turn on the "Add visitor location headers" managed transform for the fields after `country`. |
| `"cloudfront"` | Every field except `continent`.                          | Add the `CloudFront-Viewer-*` headers to an origin request policy.                           |
| `"vercel"`     | Every field.                                             | None.                                                                                        |

## Types

```ts
type HeadersLike = Headers | Readonly<Record<string, string | readonly string[] | undefined>>
```

Request headers, either as a Fetch `Headers` object or as a record, such as Node.js's `IncomingMessage.headers`. Record names match in any case, because some sources, such as an AWS API Gateway REST event, keep the case the client sent. A record joins repeated values with commas.

```ts
interface RequestLike {
  readonly headers: HeadersLike
  readonly info?: { readonly remoteAddress?: string | null | undefined } | null | undefined
  readonly ip?: unknown
  readonly requestContext?:
    | { readonly identity?: { readonly sourceIp?: string | null | undefined } | null | undefined }
    | null
    | undefined
  readonly socket?: { readonly remoteAddress?: string | null | undefined } | null | undefined
}
```

A request from any runtime or framework. A Fetch `Request`, a Node.js `IncomingMessage`, an Express request, a Hapi request, and an AWS API Gateway event all match it.

```ts
type IpPlatform =
  | "app-engine"
  | "cloudflare"
  | "cloudfront"
  | "firebase"
  | "fly-io"
  | "render"
  | "vercel"
type GeoPlatform = "app-engine" | "cloudflare" | "cloudfront" | "vercel"
```

The platforms each function supports. `GeoPlatform` leaves out platforms that send no location, so `geo(request, { platform: "fly-io" })` is a type error.

```ts
interface Coordinates {
  readonly latitude: number
  readonly longitude: number
}
```

The client's position, as `Geo` reports it.

```ts
type Continent = "AF" | "AN" | "AS" | "EU" | "NA" | "OC" | "SA"
type CountryCode = string & { readonly [countryCode]: true }
type RegionCode = string & { readonly [regionCode]: true }
```

The location codes `geo` reads. `CountryCode` and `RegionCode` are strings, so they compare with string literals, such as `geo(request, options).country === "US"`. Each is branded, so a region code cannot stand in for a country code. As a region, `CA` is California, and as a country, it is Canada.
