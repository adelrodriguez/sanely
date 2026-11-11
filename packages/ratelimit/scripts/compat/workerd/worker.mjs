// Exports the built Durable Object class by its package name, as an application does, so the check
// also covers the `workerd` condition in the export map.
export { RateLimitObject } from "@sanely/ratelimit/stores/durable-object"

export default {
  fetch: () => new Response(null, { status: 404 }),
}
