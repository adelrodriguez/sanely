import { CLIENT_HELPER_KEYS, INERT_KEYS } from "#lib/core/contract.ts"

export function createRecursiveProxy(
  callback: (opts: { path: readonly string[]; args: readonly unknown[] }) => unknown,
  path: readonly string[]
): unknown {
  // Each node remembers its children, so `api.a.b === api.a.b`: a node is safe as a Map key or a
  // React dependency.
  const children = new Map<string, unknown>()

  return new Proxy(
    () => {
      // dummy no-op function since we don't have any client-side target we want
      // to remap to
    },
    {
      apply(_1, _2, args) {
        return callback({ args, path })
      },
      get: (_obj, key) => {
        if (typeof key !== "string" || INERT_KEYS.has(key)) {
          return
        }

        const nextPath = [...path, key]

        if (key.startsWith("$")) {
          return CLIENT_HELPER_KEYS.has(key) ? callback({ args: [], path: nextPath }) : undefined
        }

        // For all other keys, keep recursing and treat the final value as
        // a callable function (handled in the `apply` trap).
        let child = children.get(key)

        if (child === undefined) {
          child = createRecursiveProxy(callback, nextPath)
          children.set(key, child)
        }

        return child
      },
    }
  )
}
