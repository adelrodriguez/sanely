# `@sanely/rpc`

Type-safe calls from one schema contract: the caller gets a typed client, the receiver gets a router that validates every input, and any transport carries the calls between them.

## Contracts

**Contract**:
A tree of schemas that both sides share. Its branches are plain objects, and its leaves are channels.
_Avoid_: schema, API definition, spec

**Channel**:
One leaf of a contract: an input schema, and an output schema for a round trip.
_Avoid_: procedure, endpoint, route, method

**Path**:
A channel's keys joined with `.`, such as `notes.open`. It names the channel on every transport.
_Avoid_: route, channel name, key

**Round trip**:
A channel with an output schema. Its call resolves with the resolver's result, parsed against that schema.
_Avoid_: request/response channel, query

**One-way channel**:
A channel with no output schema. Its call resolves with whatever the transport returned, such as a queue receipt.
_Avoid_: event, notification, fire-and-forget

## Serving

**Resolver**:
The function that serves one channel. It receives the parsed input, the context, and a signal.
_Avoid_: handler, procedure, implementation

**Fragment**:
A resolver bound to the path of the channel it serves, built with `implement`.
_Avoid_: handler, partial

**Handler tree**:
Fragments arranged in the shape of the contract, such as a namespace import of one file per branch.
_Avoid_: handler map, resolver tree

**Flat resolver map**:
Resolvers keyed by path, the other shape a router accepts.
_Avoid_: handler map, resolver record

**Router**:
The receiver's validating dispatcher for one contract, or for several merged into one.
_Avoid_: server, service, handler

**Context**:
What the edge knows about a call's origin, such as the session or the sender, passed to every resolver. It never travels in the payload.
_Avoid_: request, session (for the general concept), metadata

**Edge**:
The code at a boundary that hands calls to a router, such as an IPC loop, a fetch handler, or a `connect` session.
_Avoid_: adapter (for this role), middleware, gateway

## Calling

**Client**:
The caller's typed object in the shape of the contract. Every leaf is a function that calls its channel.
_Avoid_: stub, proxy, SDK

**Transport**:
The one function a client calls to deliver a validated payload to a path and get back what the other side returned.
_Avoid_: link, connection, driver

**Helper**:
A `$` key on a client node, such as `$path` or `$with`, which reads or binds rather than calls.
_Avoid_: meta property, accessor

## Wires

**Wire**:
A duplex pipe that sends a value and hands incoming values to a listener, such as a MessagePort or a WebSocket.
_Avoid_: channel, pipe, socket (for the general concept)

**Session**:
One end's use of a wire through `connect`, which serves the peer's calls and calls the peer.
_Avoid_: connection, link

**Envelope**:
A call's outcome as a serializable value, so a failure keeps its code and fields across a boundary.
_Avoid_: response, wrapper, result object

**Hidden failure**:
A failure that crosses a boundary only as code `internal`, because it may reveal the server. The real error goes to the server's own logs.
_Avoid_: masked error, internal error (for the original failure)

## Failures

**Call failure**:
A failure of one call, raised as a `ChannelError` and serializable across a boundary.
_Avoid_: RPC error, transport error

**Setup error**:
A wiring mistake, raised as a `SetupError` where the contract, router, or hand-off is built. It never crosses a boundary.
_Avoid_: configuration error, validation error
