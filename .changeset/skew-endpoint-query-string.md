---
"@sanely/skew": patch
---

Serve a local endpoint that has a query string, such as `/descriptor.json?tenant=a`

The Vite adapter wrote the descriptor to a file named `descriptor.json?tenant=a`, so a request for the endpoint found no file. The Next.js adapter put the query string in its `headers()` rule, and Next.js rejected the config. Both adapters now drop the query string and the fragment when they choose where to serve the descriptor, and the embed keeps the endpoint as you wrote it.
