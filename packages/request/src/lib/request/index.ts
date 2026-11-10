/**
 * Request headers, either as a Fetch `Headers` object or as a Node.js-style record with lowercase
 * names, such as `IncomingMessage.headers`.
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

/**
 * Reads one header by its lowercase name, trimmed. Repeated values in a record are joined with
 * commas, as `Headers` joins them. An empty value reads as missing.
 */
export function readHeader(request: RequestLike, name: string): string | undefined {
  const { headers } = request
  const value = isHeaders(headers) ? headers.get(name) : headers[name]
  const text = typeof value === "object" && value !== null ? value.join(",") : value

  const trimmed = text?.trim()

  return trimmed === "" ? undefined : trimmed
}
