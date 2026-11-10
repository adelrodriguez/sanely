# `@sanely/request` glossary

`@sanely/request` reads what the network and the hosting platform report about a request. Use these terms, with these meanings, in code, tests, issues, and docs.

## Language

**Reader**:
A public function that takes a request and returns one fact about it, such as `ip` or `geo`.
_Avoid_: Helper, extractor, getter

**Platform**:
The hosting service in front of the app, such as Vercel or Cloudflare. A platform sets some headers on every request and replaces any value the client sent, so a reader can trust those headers.
_Avoid_: Provider, host, environment

**Client IP**:
The public address of the party that sent the request, as `ip` returns it.
_Avoid_: Remote address (that is the connection's address, which can be a proxy), user IP

**Trusted proxy**:
An address or CIDR range, listed in `proxies`, of a proxy that the app's owner runs. `ip` never returns a trusted proxy.
_Avoid_: Allowed proxy, safe IP

**Global address**:
An address that can belong to a client on the public internet: one outside every private, loopback, link-local, documentation, benchmarking, and reserved block.
_Avoid_: Public IP (in code), routable address

**Location**:
Where the client is, as `geo` returns it, made of the fields of `Geo`.
_Avoid_: Geolocation (in prose, use location), position

## Scope

The package reads facts about where a request came from and what the platform attached to it. It does not parse bodies, cookies, or query strings.
