<div align="center">
  <h1 align="center">🚌 <code>@sanely/rpc</code></h1>

  <p align="center">
    <strong>Type-safe RPC over any transport</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/@sanely/rpc"><img src="https://img.shields.io/npm/v/@sanely/rpc" alt="npm version"></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/github/license/adelrodriguez/sanely" alt="license"></a>
  </p>
</div>

> [!WARNING]
> `@sanely/rpc` is pre-1.0. Expect breaking changes in minor releases.

You write a contract once, as a tree of schemas. The package turns it into two things. The caller gets a typed client, where `client.files.open()` is a function call. The receiver gets a router that validates every input before your code sees it.

What sits between them is up to you. A transport is one function, `(path, payload) => result`, so the same contract runs over Electron IPC, a worker thread, a WebSocket, an HTTP endpoint, a message queue, or a direct in-memory call.

## Features

- **No codegen.** Types come from the contract.
- **Any schema library.** Schemas can come from any [Standard Schema](https://standardschema.dev) library, such as [Zod](https://zod.dev), [Valibot](https://valibot.dev), or [ArkType](https://arktype.io).
- **Validation at both ends.** The router parses the input before a resolver runs and parses the result before it leaves. A resolver that returns the wrong shape fails on the server, so the caller never gets bad data.
- **Complete routers.** A missing resolver is a compile error.
- **Wires.** `@sanely/rpc/wire` carries errors across serialization, hiding server-side details by default. It also turns message pipes into request/response calls you can cancel, and it ships an HTTP handler and transport and wires for MessagePorts and WebSockets.

## Install

```bash
npm install @sanely/rpc
```

Add a [Standard Schema](https://standardschema.dev) library too. These docs use Zod. The package needs Node.js 20 or later.

## Get started

```ts
import { channel, createClient, createRouter, defineContract } from "@sanely/rpc"
import * as z from "zod"

const contract = defineContract({
  greetings: {
    hello: channel({ input: z.object({ name: z.string() }), output: z.string() }),
  },
})

const router = createRouter(contract, {
  "greetings.hello": ({ input: { name } }) => `Hello, ${name}!`,
})

const client = createClient(contract, router.dispatch)

await client.greetings.hello({ name: "Ada" }) // "Hello, Ada!"
```

To move the router into another process, replace `router.dispatch` with a transport that crosses the boundary.

## Documentation

Tutorial:

- [Build your first contract](./docs/tutorials/build-your-first-contract.md)

How-to guides:

- [How to split resolvers across files](./docs/how-to/split-handlers-across-files.md)
- [How to pass per-call options](./docs/how-to/pass-per-call-options.md)
- [How to cancel a call](./docs/how-to/cancel-calls.md)
- [How to serve a contract over HTTP](./docs/how-to/serve-over-http.md)
- [How to call the Electron main process over IPC](./docs/how-to/call-electron-main-over-ipc.md)
- [How to call in both directions over Electron MessagePorts](./docs/how-to/call-over-electron-message-ports.md)
- [How to write your own transport](./docs/how-to/write-a-transport.md)

Reference:

- [API reference](./docs/reference.md)

Explanation:

- [About validation and trust](./docs/explanation/validation-and-trust.md)

## Contributing

Read the [architecture](docs/architecture.md), [testing guide](docs/testing.md), and root [contributor guide](../../CONTRIBUTING.md) before changing the package.

## License

MIT. See [LICENSE](../../LICENSE).
