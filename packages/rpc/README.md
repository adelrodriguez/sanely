<p align="center">
  <h1 align="center">🚌 <code>@sanely/rpc</code></h1>
  <p align="center">
    <strong>Type-safe RPC over any transport</strong>
  </p>
</p>

> [!WARNING]
> `@sanely/rpc` is pre-1.0. Expect breaking changes in minor releases.

You write a contract once, as a tree of schemas. The package turns it into two things. The caller gets a typed client, where `client.files.open()` is a function call. The receiver gets a router that validates every input before your code sees it.

What sits between them is up to you. A transport is one function, `(path, payload) => result`, so the same contract runs over Electron IPC, a worker thread, a WebSocket, an HTTP endpoint, a message queue, or a direct in-memory call.

- Types come from the contract. There is no codegen step.
- Schemas can come from any [Standard Schema](https://standardschema.dev) library, such as [Zod](https://zod.dev), [Valibot](https://valibot.dev), or [ArkType](https://arktype.io).
- The router parses the input before a resolver runs and parses the result before it leaves. A resolver that returns the wrong shape fails on the server, so the caller never gets bad data.
- A missing resolver is a compile error.
- `@sanely/rpc/wire` carries errors across serialization, hiding server-side details by default. It also turns message pipes into request/response calls you can cancel, and it ships an HTTP handler and transport and wires for MessagePorts and WebSockets.

## Install

```bash
npm install @sanely/rpc
```

Add a [Standard Schema](https://standardschema.dev) library too. These docs use Zod.

## Documentation

Tutorial:

- [Build your first contract](./docs/tutorials/build-your-first-contract.md)

How-to guides:

- [Split handlers across files](./docs/how-to/split-handlers-across-files.md)
- [Pass per-call options like an `AbortSignal`](./docs/how-to/pass-per-call-options.md)
- [Cancel a call and stop its resolver](./docs/how-to/cancel-calls.md)
- [Serve a contract over HTTP](./docs/how-to/serve-over-http.md)
- [Call the Electron main process over IPC](./docs/how-to/call-electron-main-over-ipc.md)
- [Call in both directions over Electron MessagePorts](./docs/how-to/call-over-electron-message-ports.md)
- [Write your own transport](./docs/how-to/write-a-transport.md)

Reference:

- [API reference](./docs/reference.md)

Explanation:

- [About validation and trust](./docs/explanation/validation-and-trust.md)

## License

MIT. See [LICENSE](../../LICENSE).
