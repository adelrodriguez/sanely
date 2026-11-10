import type { Address } from "./index.ts"
import { ADDRESS_BITS, parse } from "./index.ts"

/**
 * A block of addresses: every address whose first `bits` bits match `network`.
 */
export interface Range {
  readonly bits: number
  readonly network: Address
}

const PREFIX = /^\d{1,3}$/

/**
 * Parses a CIDR range, such as `10.0.0.0/8`, or a single address, which is a full-length range.
 */
export function parseRange(text: string): Range | undefined {
  const [host = "", prefix, extra] = text.trim().split("/")
  if (extra !== undefined) return undefined

  const network = parse(host)
  if (!network) return undefined

  const size = ADDRESS_BITS[network.version]
  if (prefix === undefined) return { bits: size, network }
  if (!PREFIX.test(prefix)) return undefined

  const bits = Number(prefix)
  return bits <= size ? { bits, network } : undefined
}

export function contains(range: Range, address: Address) {
  if (range.network.version !== address.version) return false

  const hostBits = BigInt(ADDRESS_BITS[address.version] - range.bits)

  return address.value >> hostBits === range.network.value >> hostBits
}
