# How to run an ordered workflow with `flow`

This guide shows you how to run steps that depend on earlier steps, and end the workflow with an explicit result.

1. Write each step as a task method. Read earlier results through `this.$result`:

   ```ts
   import * as try$ from "@sanely/try"

   const cache = new Map<string, string>()

   const avatar = await try$.flow({
     cached() {
       const hit = cache.get("user_42")

       if (hit !== undefined) {
         return this.$exit(hit) // A cache hit ends the flow with this value.
       }

       return null
     },
     async fetched() {
       await this.$result.cached // On a cache hit, the exit stops this task here.

       const response = await fetch("https://api.example.com/users/42", { signal: this.$signal })
       const user = (await response.json()) as { avatarUrl: string }
       return user.avatarUrl
     },
     async stored() {
       const avatarUrl = await this.$result.fetched
       cache.set("user_42", avatarUrl)
       return this.$exit(avatarUrl)
     },
   })

   // avatar is string
   ```

2. End every path with `return this.$exit(value)`. The first exit becomes the result of the flow. If no task exits, `flow` throws a `Panic`.

3. Make the later steps wait before they start side effects. Tasks start together, as in `all`, and `$exit` does not stop a task that already started. Await an earlier result through `this.$result`, or check `this.$signal`, before a side effect.

## Retry one step

`retry` is not available for `flow`, and `timeout` covers the whole flow. To give one step its own policy, run its work with a nested `run`:

```ts
const result = await try$.flow({
  async shipment() {
    const label = await try$.retry(2).run(async () => {
      const response = await fetch("https://api.example.com/labels", { method: "POST" })

      if (!response.ok) {
        throw new Error(`unexpected status ${response.status}`)
      }

      return (await response.json()) as { trackingNumber: string }
    })

    return this.$exit(label)
  },
})
```

A `Panic` in any task wins, even after the first exit. Refer to the [`flow` reference](../reference.md#flowtasks) for the full rules.
