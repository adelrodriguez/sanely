/**
 * Request headers, either as a Fetch `Headers` object or as a record, such as Node.js's
 * `IncomingMessage.headers`. Record names match in any case.
 */
export type HeadersLike = Headers | Readonly<Record<string, string | readonly string[] | undefined>>

/**
 * A request from any runtime or framework. Only `headers` is required. The other fields carry the
 * connection's address where a runtime or framework reports it.
 */
export interface RequestLike {
  readonly headers: HeadersLike
  /**
   * Hapi's request info.
   */
  readonly info?: { readonly remoteAddress?: string | null | undefined } | null | undefined
  /**
   * The address a framework resolved, such as Express's `request.ip`.
   */
  readonly ip?: unknown
  /**
   * The AWS API Gateway event context.
   */
  readonly requestContext?:
    | { readonly identity?: { readonly sourceIp?: string | null | undefined } | null | undefined }
    | null
    | undefined
  /**
   * The Node.js connection.
   */
  readonly socket?: { readonly remoteAddress?: string | null | undefined } | null | undefined
}

// A record's values are strings or arrays, never functions, so only `Headers` has a `get` method.
function isHeaders(headers: HeadersLike): headers is Headers {
  return typeof headers.get === "function"
}

// Node.js lowercases header names, but some sources keep the case the client sent, such as an AWS
// API Gateway REST event. Header names are case-insensitive, so match them that way.
function readRecord(headers: Exclude<HeadersLike, Headers>, name: string) {
  const key = Object.hasOwn(headers, name)
    ? name
    : Object.keys(headers).find((key) => key.toLowerCase() === name)

  return key === undefined ? undefined : headers[key]
}

/**
 * Reads one header by its lowercase name, trimmed. Repeated values in a record are joined with
 * commas, as `Headers` joins them. An empty value reads as missing.
 */
export function readHeader(request: RequestLike, name: string): string | undefined {
  const { headers } = request
  const value = isHeaders(headers) ? headers.get(name) : readRecord(headers, name)
  const text = typeof value === "object" && value !== null ? value.join(",") : value

  const trimmed = text?.trim()

  return trimmed === "" ? undefined : trimmed
}

/**
 * Checks a reader's platform at runtime, where a typo or an unset environment variable can reach it
 * despite the type. Throws a `TypeError` that lists what the reader accepts.
 */
export function checkPlatform<Platform extends string>(
  platform: unknown,
  platforms: Readonly<Record<Platform, unknown>>,
  expected: string
): asserts platform is Platform {
  if (typeof platform === "string" && Object.hasOwn(platforms, platform)) return

  throw new TypeError(
    `Unknown platform ${String(JSON.stringify(platform))}. Expected ${expected}${Object.keys(platforms).join(", ")}`
  )
}
