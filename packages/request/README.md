<div align="center">
  <h1 align="center">🌐 <code>@sanely/request</code></h1>

  <p align="center">
    <strong>Read the client IP address and location from a request</strong>
  </p>
</div>

`@sanely/request` reads what the network and the hosting platform report about a request: the client's IP address and, on platforms that send it, the client's location. It works with a Fetch `Request` and with Node.js-style requests, and it has no external dependencies.

## Quick start

```sh
npm install @sanely/request
```

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

- [Reference](docs/reference.md): `ip`, `geo`, platforms, and types

## Development

Read the [architecture](docs/architecture.md) before you change source ownership or add a reader, and the [testing guide](docs/testing.md) before you add tests.
