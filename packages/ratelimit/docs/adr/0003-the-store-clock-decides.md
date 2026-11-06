# The store's clock decides

Algorithms read the time from the store (Redis `TIME`, and later SQL `now()` or MongoDB `$$NOW`), not from the application server. Instances whose clocks drift would otherwise disagree on window boundaries. Results report `retryAfter` measured on the store's clock, so a `Retry-After` header stays correct on a drifting server, and the blocked-identity cache measures its wait on the local clock from that value.
