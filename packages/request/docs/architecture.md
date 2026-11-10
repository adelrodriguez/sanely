# Architecture

`src/index.ts` selects the public exports.
The [glossary](../GLOSSARY.md) defines the package's terms.

## Domain ownership

| Domain     | Ownership                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------- |
| `request/` | `RequestLike`, `HeadersLike`, and reading one header from either form of headers.           |
| `address/` | Parsing and formatting IPv4 and IPv6 addresses, CIDR ranges, and the special-purpose table. |
| `ip/`      | The `ip` reader: where it looks, each platform's IP headers, and trusted proxies.           |
| `geo/`     | The `geo` reader: each platform's location headers and their normalization.                 |

`request/` and `address/` import no other domain. Each reader imports `request/` and the helper domains it needs, and never another reader.
Oxlint enforces this direction, including type imports, through the `request` entry in the root `oxlint.config.ts`.
Implementation modules do not import the public entry point.

## Readers

Each public function is a reader: it takes a `RequestLike` first and returns one fact about the request.
A reader that depends on the hosting platform takes `{ platform }` as its second argument, so one options object works for every reader.
Each reader keeps its own table of platform headers and derives its platform type from that table. A platform that cannot supply the fact is a type error for that reader.

To add a reader, such as `userAgent`:

1. Add `src/lib/<reader>/index.ts`. Read headers with `readHeader` from `#lib/request/index.ts`.
2. If the reader needs a platform, add its header table and derive `<Reader>Platform` and `<Reader>Options` from it.
3. Export the function and its types from `src/index.ts`.
4. Add the domain and its dependencies to the `request` entry in `oxlint.config.ts`.
5. Add `src/__tests__/<reader>.test.ts` and its type assertions to `src/__tests__/types.test-d.ts`.
6. Document the reader in [the reference](reference.md) and the [glossary](../GLOSSARY.md).

Keep the package to what the network and the platform report about a request. It does not parse bodies, cookies, or query strings.

See the [package structure rules](../../../docs/agents/package-structure.md).
