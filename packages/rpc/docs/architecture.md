# Architecture

The public entry points are `src/index.ts`, `src/wire.ts`, and the transport entries in `src/wire/`: `fetch.ts`, `message-port.ts`, and `web-socket.ts`.
They select the published exports and hold no implementation.

## Domain ownership

| Domain      | Ownership                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `core/`     | Contracts and their traversal, schema parsing, the transport type, and both error classes.                 |
| `client/`   | The client proxy, its helpers, and per-call options.                                                       |
| `server/`   | Resolver types, `implement` and fragments, routers, and `mergeRouters` with its context types.             |
| `wire/`     | The envelope, the `Wire` type, `connect` sessions, and the queue for a wire that has not arrived.          |
| `adapters/` | Transport-specific wires and edges: MessagePorts and the Electron hand-off, WebSockets, and the Fetch API. |

The root lint configuration enforces this dependency direction, including type imports:

```text
adapters -> core, server, wire
wire     -> core, server
client   -> core
server   -> core
core     -> no other domain
```

`client` and `server` never import each other. A client calls a router only through a `Transport` that the caller passes in.

## Errors

`core/error.ts` owns every `ChannelError` code in one table: its fields, the guards that parse it from a wire, its message, and whether it always crosses a wire.
The table is typed against the `ChannelErrorDetail` union, so the build fails when the two disagree. To add a code, add a variant to the union and a row to the table.
`adapters/fetch.ts` maps each code to an HTTP status in a table of its own, which the type also requires to be complete.

`SetupError` lists its codes in its detail union and an exhaustive `switch`. It never crosses a wire, so it has no parser.

## Wire protocol

Every `connect` message carries `rpc: 1` and the calling session's random id, `sid`. A reply and a cancel echo the caller's `sid`, and a serving end tracks requests by `sid` and request id.
Sessions that share a wire therefore never take each other's replies or cancels. A message without the marker, or with another version, is foreign traffic and is ignored.

A wire has one serving end. Two sessions that both serve one wire both answer every request, and the caller takes the first reply. Combine routers with `mergeRouters` instead.

## State and compatibility

Each `connect` session owns its session id, its pending calls, the requests it is serving, and its closed state. A pending wire owns its outbound queue until the wire arrives.
Each router owns a prototype-free snapshot of its leaves and resolvers, so an untrusted path never resolves to an `Object.prototype` member.
Each client node owns a cache of its children, so a node is stable across reads.

- The client parses input before it calls the transport and sends the input as the caller wrote it. Only the router's parse is a trust boundary.
- The router parses a round trip's result against its output schema. The client never parses a result.
- `toWire` and `connect` hide every failure except the always-exposed codes, unless `expose` accepts it.
- The protocol version is `1`. Changing a message's shape requires a new version, and peers of different versions ignore each other.

See the [package structure rules](../../../docs/agents/package-structure.md) and [test requirements](testing.md).
