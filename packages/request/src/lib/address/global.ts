import type { Address } from "./index.ts"
import type { Range } from "./range.ts"
import { contains, parseRange } from "./range.ts"

// Special-purpose blocks from the IANA IPv4 and IPv6 address registries, marked by whether their
// addresses are reachable from the public internet. The first matching block decides, so each
// exception comes before the block that holds it. Addresses outside every block are global.
const BLOCKS: ReadonlyArray<readonly [cidr: string, global: boolean]> = [
  ["0.0.0.0/8", false], // This network
  ["10.0.0.0/8", false], // Private use
  ["100.64.0.0/10", false], // Shared address space
  ["127.0.0.0/8", false], // Loopback
  ["169.254.0.0/16", false], // Link local
  ["172.16.0.0/12", false], // Private use
  ["192.0.0.0/24", false], // IETF protocol assignments
  ["192.0.2.0/24", false], // Documentation
  ["192.168.0.0/16", false], // Private use
  ["198.18.0.0/15", false], // Benchmarking
  ["198.51.100.0/24", false], // Documentation
  ["203.0.113.0/24", false], // Documentation
  ["240.0.0.0/4", false], // Reserved, including the limited broadcast address
  ["::/128", false], // Unspecified
  ["::1/128", false], // Loopback
  ["::ffff:0:0/96", false], // IPv4-mapped
  ["64:ff9b:1::/48", false], // IPv4-IPv6 translation for local use
  ["100::/64", false], // Discard only
  ["2001:1::1/128", true], // Port Control Protocol anycast
  ["2001:1::2/128", true], // TURN anycast
  ["2001:3::/32", true], // AMT
  ["2001:4:112::/48", true], // AS112-v6
  ["2001:20::/28", true], // ORCHIDv2
  ["2001::/23", false], // IETF protocol assignments
  ["2001:db8::/32", false], // Documentation
  ["fc00::/7", false], // Unique local
  ["fe80::/10", false], // Link local
]

function block(cidr: string, global: boolean): { global: boolean; range: Range } {
  const range = parseRange(cidr)
  if (!range) throw new Error(`Invalid special-purpose block ${cidr}`)

  return { global, range }
}

const TABLE = BLOCKS.map(([cidr, global]) => block(cidr, global))

/**
 * Whether the address can belong to a client on the public internet.
 */
export function isGlobal(address: Address) {
  return TABLE.find(({ range }) => contains(range, address))?.global ?? true
}
