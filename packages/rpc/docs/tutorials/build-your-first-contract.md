# Build your first contract

In this tutorial, we build a contract with two channels, serve it, and call it. Everything runs in one process, so we need no server and no network.

First, install the package and Zod in a new folder:

```bash
npm install @sanely/rpc zod
```

Create `rpc.mts` and define the contract. The `.mts` extension makes the file an ES module, which the top-level `await` calls below need. It has one round trip, `greetings.hello`, which returns a string, and one one-way channel, `log`, which returns nothing:

```typescript
import { ChannelError, channel, createClient, createRouter, defineContract } from "@sanely/rpc"
import * as z from "zod"

const contract = defineContract({
  greetings: {
    hello: channel({ input: z.object({ name: z.string() }), output: z.string() }),
  },
  log: channel(z.string()),
})
```

Now implement it with a router. Each key is a dotted path from the contract. Hover over `name` or `message` in your editor, and you see that TypeScript already knows their types:

```typescript
const router = createRouter(contract, {
  "greetings.hello": ({ input: { name } }) => `Hello, ${name}!`,
  log: ({ input: message }) => {
    console.log("server got:", message)
  },
})
```

Next, create a client. A client needs a transport, and `router.dispatch` is already one, so we pass it in directly:

```typescript
const client = createClient(contract, router.dispatch)

console.log(await client.greetings.hello({ name: "Ada" }))
await client.log("ping")
```

Run the file with `npx tsx rpc.mts`. You see:

```text
Hello, Ada!
server got: ping
```

Finally, send the router a bad input. The client won't let us, because `{ name: 42 }` is a type error and the client also parses the input at runtime. So we call `router.dispatch` directly, the way an untrusted sender would:

```typescript
try {
  await router.dispatch("greetings.hello", { name: 42 })
} catch (error) {
  if (error instanceof ChannelError && error.code === "validation") {
    console.log("rejected:", error.issues[0]?.message)
  }
}
```

Run the file again. The resolver never runs, and you see a new line:

```text
rejected: Invalid input: expected string, received number
```

We now have a contract, a router that guards it, and a typed client. To move the router into another process, replace `router.dispatch` with a transport that crosses the boundary. The [how-to guides](../../README.md#documentation) show how.
