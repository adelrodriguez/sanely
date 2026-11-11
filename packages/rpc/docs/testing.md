# Testing

Public contract suites live in `src/__tests__/` and import the public source entry points.
`valibot.test.ts` runs a contract built from a second schema library, including issues that cross a structured-clone boundary.

Module suites live in adjacent `__tests__/` folders and match their source filenames.
Test a module through its exports and assert outcomes a caller can observe, such as a result, a rejection's code and fields, or the messages a peer receives.

Run the stack in memory where you can:

- Pass `router.dispatch` to `createClient` as the transport.
- Join two `connect` sessions with an in-memory wire pair that structured-clones every message, as a MessagePort would.
- Join `fetchTransport` to `fetchHandler` through the transport's `fetch` option, with a stand-in that rejects on abort as `fetch` does.

The `ws` package backs one test of a real socket closed mid-handshake. Every other socket and port test uses a fake with the same listener API.

Public type assertions live in `src/__tests__/types.test-d.ts` and use Vitest's `expectTypeOf` and `@ts-expect-error` lines.
The workspace `check` command checks these assertions. Vitest does not run them.
A module suite may hold a `typeAssertions` function for types it owns. It is type-checked and never called.
Build workspace dependencies before the workspace check.

`build:verify` checks the installed package, every entry point's exports, and strict NodeNext declarations.
`test:compat` checks that the built package loads on the Node.js floor in `engines.node`.
