/**
 * An IPv4 or IPv6 address, with its bits as one number.
 */
export interface Address {
  readonly version: 4 | 6
  readonly value: bigint
}

/**
 * The number of bits in an address of each version.
 */
export const ADDRESS_BITS = { 4: 32, 6: 128 } as const

// Leading zeros are rejected because some parsers read them as octal (RFC 6943, section 3.1.1).
const OCTET = /^(?:0|[1-9]\d{0,2})$/
const GROUP = /^[\da-f]{1,4}$/i

const BRACKETED = /^\[([^\]]+)\](?::\d{1,5})?$/
const WITH_PORT = /^([^:]+):\d{1,5}$/
const ZONE = /%[\w.-]+$/

// The 16 one bits that come before the IPv4 address in an IPv4-mapped address, and the mask for
// the IPv4 address itself. They are shifts instead of hex literals because oxfmt lowercases hex
// digits that the lint preset requires in uppercase. Write them as hex once this is fixed:
// https://github.com/adelrodriguez/adamantite/issues/721
const MAPPED_PREFIX = (1n << 16n) - 1n
const IPV4_MASK = (1n << 32n) - 1n

function join(parts: readonly number[], bitsPerPart: bigint) {
  return parts.reduce((value, part) => (value << bitsPerPart) | BigInt(part), 0n)
}

function parseOctets(text: string) {
  const fields = text.split(".")
  if (fields.length !== 4 || !fields.every((field) => OCTET.test(field))) return

  const octets = fields.map(Number)
  return octets.every((octet) => octet <= 255) ? octets : undefined
}

// Reads colon-separated groups. Only the last field of an address can hold an embedded IPv4
// address, such as `::ffff:192.0.2.1`.
function parseGroups(text: string, ipv4Tail: boolean) {
  if (text === "") return []

  const fields = text.split(":")
  const groups: number[] = []

  for (const [index, field] of fields.entries()) {
    if (GROUP.test(field)) {
      groups.push(Number.parseInt(field, 16))
      continue
    }

    const octets = ipv4Tail && index === fields.length - 1 ? parseOctets(field) : undefined
    if (!octets) return

    groups.push(Number(join(octets.slice(0, 2), 8n)), Number(join(octets.slice(2), 8n)))
  }

  return groups
}

function parseIpv6Groups(text: string) {
  const [head = "", tail, extra] = text.split("::")
  if (extra !== undefined) return

  if (tail === undefined) {
    const groups = parseGroups(head, true)
    return groups?.length === 8 ? groups : undefined
  }

  const headGroups = parseGroups(head, false)
  const tailGroups = parseGroups(tail, true)
  if (!headGroups || !tailGroups) return

  // `::` stands for at least one group of zeros.
  const zeros = 8 - headGroups.length - tailGroups.length
  if (zeros < 1) return

  return [...headGroups, ...Array.from({ length: zeros }, () => 0), ...tailGroups]
}

/**
 * Parses an address written alone, such as `192.0.2.1` or `2001:db8::1`. An IPv4-mapped IPv6
 * address, such as `::ffff:192.0.2.1`, parses as IPv4.
 */
export function parse(text: string): Address | undefined {
  const octets = parseOctets(text)
  if (octets) return { value: join(octets, 8n), version: 4 }

  const groups = parseIpv6Groups(text)
  if (!groups) return undefined

  const value = join(groups, 16n)
  // A dual-stack socket reports an IPv4 client as an IPv4-mapped address in `::ffff:0:0/96`, such
  // as `::ffff:192.0.2.1`. It is read as IPv4, so both spellings of one client are one address.
  if (value >> 32n === MAPPED_PREFIX) return { value: value & IPV4_MASK, version: 4 }

  return { value, version: 6 }
}

/**
 * Parses an address as a request reports it, which can carry a port or an IPv6 zone, such as
 * `192.0.2.1:443`, `[2001:db8::1]:443`, or `fe80::1%1`.
 */
export function parseHost(text: string) {
  const host = BRACKETED.exec(text)?.[1] ?? WITH_PORT.exec(text)?.[1] ?? text

  return parse(host.replace(ZONE, ""))
}

function split(value: bigint, count: number, bitsPerPart: bigint) {
  const mask = (1n << bitsPerPart) - 1n

  return Array.from({ length: count }, (_, index) =>
    Number((value >> (BigInt(count - 1 - index) * bitsPerPart)) & mask)
  )
}

// RFC 5952: lowercase hex without leading zeros, and `::` for the first longest run of two or
// more zero groups.
function formatIpv6(groups: readonly number[]) {
  let longest = { length: 1, start: -1 }
  let run = { length: 0, start: 0 }

  for (const [index, group] of groups.entries()) {
    run =
      group === 0
        ? { length: run.length + 1, start: run.length === 0 ? index : run.start }
        : { length: 0, start: 0 }
    if (run.length > longest.length) longest = run
  }

  const hex = groups.map((group) => group.toString(16))
  if (longest.start === -1) return hex.join(":")

  const head = hex.slice(0, longest.start).join(":")
  const tail = hex.slice(longest.start + longest.length).join(":")

  return `${head}::${tail}`
}

/**
 * Writes an address in its canonical form, so one address always has one spelling.
 */
export function format(address: Address) {
  if (address.version === 4) return split(address.value, 4, 8n).join(".")

  return formatIpv6(split(address.value, 8, 16n))
}
