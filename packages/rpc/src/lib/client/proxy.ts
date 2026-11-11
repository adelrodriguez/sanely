import { INERT_KEYS } from "#lib/core/contract.ts"

/**
 * A callable Proxy that records the path it was reached by. Calling a node runs `call` with that
 * path. Reading a `$`-prefixed key runs `helper` with the key and the node's path instead of
 * recursing, so helpers such as `$path` resolve on property access.
 */
export function createRecursiveProxy(
  call: (opts: { path: readonly string[]; args: readonly unknown[] }) => unknown,
  helper: (opts: { key: string; parent: readonly string[] }) => unknown,
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
        return call({ args, path })
      },
      get: (_obj, key) => {
        if (typeof key !== "string" || INERT_KEYS.has(key)) {
          return
        }

        if (key.startsWith("$")) {
          return helper({ key, parent: path })
        }

        let child = children.get(key)

        if (child === undefined) {
          child = createRecursiveProxy(call, helper, [...path, key])
          children.set(key, child)
        }

        return child
      },
    }
  )
}
