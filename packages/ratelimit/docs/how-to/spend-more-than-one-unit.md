# How to charge more than one unit for a request

This guide shows you how to make one request spend several units, such as the number of tokens that a call to a language model used.

1. Use a limit or capacity that is in the same unit as the cost:

   ```typescript
   const perUserTokens = limiter({
     name: "llm:user",
     algorithm: fixedWindow({ limit: 100_000, window: ms("1d") }),
     identify: (c: Context) => c.get("userId"),
   })
   ```

2. Pass the cost to `rateLimit`:

   ```typescript
   await rateLimit(perUserTokens, c, { cost: usage.totalTokens })
   ```

The cost must be an integer from 1 to the limit or capacity of every limiter that you pass. Otherwise `rateLimit` rejects with `InvalidOptionError` and spends nothing. The default cost is 1.

A denied request spends nothing. A request that costs 5 when 3 units are left is denied, and the 3 units stay available.

To read the units left without spending any, call `remaining(perUserTokens, c)`. To restore every unit, call `clear(perUserTokens, c)`. Both reject with `StoreError` when the store fails.
