import type { Transport } from "#lib/core/transport.ts"
import { type Channel, type ContractTree, flatten } from "#lib/core/contract.ts"
import { ChannelError } from "#lib/core/error.ts"
import { isRecord } from "#lib/core/guards.ts"
import { parseWith } from "#lib/core/schema.ts"
import type { InferClient } from "./types.ts"
import { createRecursiveProxy } from "./proxy.ts"

/**
 * Builds the Proxy-backed client for a contract over a transport. Every leaf is directly callable.
 *
 * Input is validated before it leaves the client so the caller gets an error at the call site, then
 * sent as the caller wrote it; the parsed result is discarded. Only the receiving router's parsed
 * value reaches the resolver: client-side validation is a convenience, only the router's parse is a
 * trust boundary.
 *
 * When the transport declares a per-call options parameter, every call accepts it positionally
 * (`api.leaf(input, options)`) and `$with(options)` — on the root or any subtree — returns the same
 * client with those options bound, so leaves with `void` inputs need no `undefined` placeholder:
 * `api.$with({ signal }).localFiles.open()`.
 */
export function createClient<Tree extends ContractTree, Options = never>(
  contract: Tree,
  transport: Transport<Options>
): InferClient<Tree, Options> {
  const leaves = flatten(contract)

  const make = (bound: Options | undefined, basePath: readonly string[]): unknown =>
    createRecursiveProxy(
      ({ path, args }) =>
        // Calls always return a promise: validation and misuse failures reject
        // instead of throwing synchronously.
        // Proxy call arguments are untyped; the `InferClient` signature is what constrains them
        send(path.join("."), args[0], mergeOptions(bound, args[1] as Options | undefined)),
      ({ key, parent }) => {
        const leafPath = parent.join(".")
        const helpers: Partial<Record<string, () => unknown>> = {
          $input: () => getChannel(leaves, leafPath).input,
          $output: () => getChannel(leaves, leafPath).output,
          $path: () => {
            getChannel(leaves, leafPath)
            return leafPath
          },
          $with: () => (options: Options) => make(mergeOptions(bound, options), parent),
        }

        // `$`-keys resolve on property access. `defineContract` rejects every `$` key, so one
        // that names no helper is a probe, such as pretty-format's `$$typeof`, and stays inert.
        // No `Object.prototype` member starts with `$`, so the lookup cannot reach one.
        return helpers[key]?.()
      },
      basePath
    )

  // The Proxy answers every path at runtime; only the contract's type knows the shape
  return make(undefined, []) as InferClient<Tree, Options>

  async function send(
    leafPath: string,
    input: unknown,
    options: Options | undefined
  ): Promise<unknown> {
    // Validate for the call-site error, but send the caller's input as written: the router parses
    // it with the same schema, and a transform (string → number) would not survive a second pass.
    await parseWith(getChannel(leaves, leafPath).input, input)

    // The transport's result is passed through untouched. One-way calls are typed
    // `Promise<unknown>` so the raw value (a queue receipt, an ack) is reachable
    // without a cast.
    return await transport(leafPath, input, options)
  }
}

function mergeOptions<Options>(
  bound: Options | undefined,
  perCall: Options | undefined
): Options | undefined {
  if (perCall === undefined) {
    return bound
  }

  if (bound === undefined) {
    return perCall
  }

  if (isRecord(bound) && isRecord(perCall)) {
    return { ...bound, ...perCall }
  }

  return perCall
}

function getChannel(leaves: Record<string, Channel>, path: string): Channel {
  const leaf = leaves[path]

  if (!leaf) {
    throw new ChannelError({ code: "unknown-channel", path })
  }

  return leaf
}
