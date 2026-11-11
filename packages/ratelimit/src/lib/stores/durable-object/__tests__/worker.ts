// The Worker in `wrangler.jsonc`. It exports the class through the public entry, as an application
// does.
export { RateLimitObject } from "#stores/durable-object.ts"

export default {
  fetch: () => new Response(null, { status: 404 }),
}
