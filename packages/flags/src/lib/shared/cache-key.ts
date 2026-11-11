export type FlagCacheKey =
  | boolean
  | number
  | string
  | null
  | undefined
  | readonly FlagCacheKey[]
  | { readonly [key: string]: FlagCacheKey }

/**
 * Encodes a cache-key value into a stable, collision-free string. Object keys are sorted so
 * insertion order does not affect the encoding, and every value is type-prefixed so distinct
 * primitives (for example 0 and "0") never collide. Values outside FlagCacheKey throw instead of
 * silently coercing into an unstable or colliding key.
 */
export function serializeKey(value: unknown, rootPath: "cacheKey"): string {
  const ancestors = new Set<object>()

  function encode(current: unknown, path: string): string {
    if (current === null) {
      return "null"
    }

    switch (typeof current) {
      case "undefined":
        return "undefined"
      case "boolean":
        return `boolean:${current}`
      case "number":
        return `number:${Object.is(current, -0) ? "-0" : String(current)}`
      case "string":
        return `string:${JSON.stringify(current)}`
      case "object": {
        const prototype: object | null = Object.getPrototypeOf(current)
        if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) {
          // A prototype may lack a constructor, or hold a non-function one.
          const { constructor }: { constructor?: unknown } = prototype
          const kind =
            typeof constructor === "function" && constructor.name
              ? constructor.name
              : "non-plain object"
          throw new TypeError(`Unsupported flag cache key at ${path}: ${kind} is not supported.`)
        }

        if (ancestors.has(current)) {
          throw new TypeError(
            `Unsupported flag cache key at ${path}: circular reference is not supported.`
          )
        }

        ancestors.add(current)
        try {
          if (Array.isArray(current)) {
            for (let index = 0; index < current.length; index += 1) {
              if (!Object.hasOwn(current, index)) {
                throw new TypeError(
                  `Unsupported flag cache key at ${path}[${index}]: sparse arrays are not supported.`
                )
              }
            }
            return `array:[${current
              .map((item, index) => encode(item, `${path}[${index}]`))
              .join(",")}]`
          }

          const entries = Object.entries(current)
            .toSorted(([left], [right]) => (left < right ? -1 : 1))
            .map(([key, item]) => `${JSON.stringify(key)}:${encode(item, `${path}.${key}`)}`)
          return `object:{${entries.join(",")}}`
        } finally {
          ancestors.delete(current)
        }
      }
      default:
        throw new TypeError(
          `Unsupported flag cache key at ${path}: ${typeof current} is not supported.`
        )
    }
  }

  return encode(value, rootPath)
}
