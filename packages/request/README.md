<div align="center">
  <h1 align="center">🌐 <code>@sanely/request</code></h1>

  <p align="center">
    <strong>Read the client IP address and location from a request</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/@sanely/request"><img src="https://img.shields.io/npm/v/@sanely/request" alt="npm version"></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/github/license/adelrodriguez/sanely" alt="license"></a>
  </p>
</div>

`@sanely/request` reads what the network and the hosting platform report about a request: the client's IP address and, on platforms that send it, the client's location.

## Features

- **Headers a client cannot forge.** Name the platform the app runs on, such as Vercel, Cloudflare, or Fly.io, and `ip` reads only the headers that platform sets.
- **Location.** `geo` reads the country, city, and other fields that the platform reports.
- **Your own proxies.** List their addresses with `parseProxies`, and `ip` skips them.
- **No platform.** With `platform: "none"`, `ip` reads the connection and falls back to common forwarding headers such as `X-Forwarded-For`.
- **Any request.** Both functions accept a Fetch `Request` or a Node.js-style request.
- **No external dependencies.**

## Install

```sh
npm install @sanely/request
```

The package needs Node.js 20 or later.

## Get started

```ts
import { geo, ip } from "@sanely/request"

const options = { platform: "vercel" } as const

ip(request, options) // "8.8.8.8"
geo(request, options).country // "US"
```

Set `platform` to the platform the app runs on. `ip` then reads only that platform's headers, which a client cannot forge. With `platform: "none"`, `ip` reads the connection and falls back to the common forwarding headers, such as `X-Forwarded-For`, which a client can forge unless a proxy in front of the app replaces them.

Behind your own proxies or load balancers, list their addresses so that `ip` skips them. Parse the list once at startup, so a bad entry fails before the app serves a request:

```ts
import { ip, parseProxies } from "@sanely/request"

const proxies = parseProxies(["10.0.0.0/8", "198.51.100.7"])

ip(request, { platform: "none", proxies })
```

## Documentation

- [Reference](docs/reference.md): `ip`, `parseProxies`, `geo`, platforms, and types

## Contributing

Read the [architecture](docs/architecture.md), [testing guide](docs/testing.md), and root [contributor guide](../../CONTRIBUTING.md) before changing the package.

## License

MIT. See [LICENSE](../../LICENSE).
