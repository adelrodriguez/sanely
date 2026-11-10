import { findUnit, UNITS } from "@sanely/core/time"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { InvalidTimeExpressionError } from "#lib/expression/errors.ts"
import { parse, safeParse } from "#lib/expression/parse.ts"

const aliases = UNITS.flatMap((unit) => unit.aliases)

const numberTokenArbitrary = fc.oneof(
  fc.integer({ max: 999, min: 0 }).map((value) => ({ token: String(value), value })),
  fc
    .record({
      fractional: fc.integer({ max: 999, min: 0 }),
      whole: fc.integer({ max: 99, min: 0 }),
    })
    .map(({ fractional, whole }) => {
      const token = `${whole}.${String(fractional).padStart(3, "0")}`
      return { token, value: Number(token) }
    }),
  fc.integer({ max: 999, min: 1 }).map((fractional) => {
    const token = `.${String(fractional).padStart(3, "0")}`
    return { token, value: Number(token) }
  }),
  fc
    .record({
      coefficient: fc.integer({ max: 99, min: 1 }),
      exponent: fc.integer({ max: 3, min: 0 }),
      exponentSign: fc.constantFrom("", "+", "-"),
      marker: fc.constantFrom("e", "E"),
    })
    .map(({ coefficient, exponent, exponentSign, marker }) => {
      const token = `${coefficient}${marker}${exponentSign}${exponent}`
      return { token, value: Number(token) }
    })
)

const segmentArbitrary = fc
  .tuple(fc.constantFrom(...UNITS), numberTokenArbitrary, fc.constantFrom("", " ", "  ", "\t"))
  .chain(([unit, number, whitespace]) =>
    fc.constantFrom(...unit.aliases).chain((alias) =>
      fc
        .array(fc.boolean(), { maxLength: alias.length, minLength: alias.length })
        .map((uppercase) =>
          alias
            .split("")
            .map((character, index) => (uppercase[index] ? character.toUpperCase() : character))
            .join("")
        )
        .filter((casing) => findUnit(casing) !== undefined)
        .map((casing) => ({
          expected: number.value * unit.ms,
          text: `${number.token}${whitespace}${casing}`,
        }))
    )
  )

const lenientExpressionArbitrary = fc
  .array(segmentArbitrary, { maxLength: 4, minLength: 1 })
  .chain((segments) =>
    fc
      .tuple(
        fc.array(fc.constantFrom("", " ", "  ", "\t", "\n", ",", ", ", " , "), {
          maxLength: segments.length - 1,
          minLength: segments.length - 1,
        }),
        fc.constantFrom("", "+", "-"),
        fc.constantFrom("", " ", "  ", "\t", "\n"),
        fc.constantFrom("", " ", "  ", "\t", "\n")
      )
      .map(([separators, sign, leadingWhitespace, trailingWhitespace]) => {
        const body = segments
          .map((segment, index) => {
            if (index === 0) return segment.text
            const separator = separators[index - 1] ?? ""
            // A segment that starts with a dot needs a separator after another segment.
            const gap = separator === "" && segment.text.startsWith(".") ? " " : separator
            return `${gap}${segment.text}`
          })
          .join("")
        const magnitude = segments.reduce((total, segment) => total + segment.expected, 0)

        return {
          expected: sign === "-" ? -magnitude : magnitude,
          text: `${leadingWhitespace}${sign}${body}${trailingWhitespace}`,
        }
      })
  )

const longCompoundExpressionArbitrary = fc.constantFrom(...UNITS).chain((unit) =>
  fc
    .tuple(fc.constantFrom(...unit.aliases), fc.constantFrom("", " ", ", "))
    .map(([alias, separator]) => {
      const segment = `1${alias}`
      const segmentCount = Math.floor(
        (200 + separator.length) / (segment.length + separator.length)
      )
      const text = Array.from({ length: segmentCount }, () => segment).join(separator)

      return {
        expected: segmentCount * unit.ms,
        text,
        tooLong: `${text}${separator}${segment}`,
      }
    })
)

const overlongPaddedExpressionArbitrary = segmentArbitrary.chain((segment) => {
  const paddingLength = 201 - segment.text.length

  return fc.integer({ max: paddingLength, min: 0 }).map((leadingPaddingLength) => ({
    expected: segment.expected,
    text: `${" ".repeat(leadingPaddingLength)}${segment.text}${" ".repeat(
      paddingLength - leadingPaddingLength
    )}`,
    trimmed: segment.text,
  }))
})

// Integer counts keep every sum exact in float64, so equality properties hold exactly.
const segmentsArbitrary = fc.array(
  fc.record({
    alias: fc.constantFrom(...aliases),
    count: fc.integer({ max: 999, min: 0 }),
  }),
  { maxLength: 5, minLength: 1 }
)

function toExpression(segments: ReadonlyArray<{ alias: string; count: number }>): string {
  return segments.map((segment) => `${segment.count}${segment.alias}`).join(" ")
}

describe("parse", () => {
  it("should parse generated lenient forms", () => {
    fc.assert(
      fc.property(lenientExpressionArbitrary, ({ expected, text }) => {
        expect(parse(text)).toBe(expected)
      })
    )
  })

  it("should reject generated malformed expressions", () => {
    fc.assert(
      fc.property(
        segmentArbitrary,
        fc.constantFrom(
          (text: string) => `,${text}`,
          (text: string) => `${text},`,
          (text: string) => `${text},,1ms`,
          (text: string) => `${text} +1ms`,
          (text: string) => `${text} -1ms`,
          (text: string) => `+ ${text}`
        ),
        ({ text }, mutate) => {
          expect(() => parse(mutate(text))).toThrow(InvalidTimeExpressionError)
        }
      )
    )
  })

  it("should reject generated exponent overflow", () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 9, min: 1 }),
        fc.integer({ max: 999, min: 309 }),
        fc.constantFrom(...aliases),
        fc.constantFrom("", "+", "-"),
        (coefficient, exponent, alias, sign) => {
          expect(() => parse(`${sign}${coefficient}e${exponent}${alias}`)).toThrow(
            InvalidTimeExpressionError
          )
        }
      )
    )
  })

  it("should enforce the 200-character boundary for generated compound expressions", () => {
    fc.assert(
      fc.property(longCompoundExpressionArbitrary, ({ expected, text, tooLong }) => {
        expect(text.length).toBeLessThanOrEqual(200)
        expect(tooLong.length).toBeGreaterThan(200)
        expect(parse(text)).toBe(expected)
        expect(() => parse(tooLong)).toThrow(InvalidTimeExpressionError)
      })
    )
  })

  it("should enforce the 200-character boundary before trimming generated expressions", () => {
    fc.assert(
      fc.property(overlongPaddedExpressionArbitrary, ({ expected, text, trimmed }) => {
        expect(text).toHaveLength(201)
        expect(parse(trimmed)).toBe(expected)
        expect(() => parse(text)).toThrow(InvalidTimeExpressionError)
      })
    )
  })

  it("should apply a leading sign to the whole expression for generated segments", () => {
    fc.assert(
      fc.property(segmentsArbitrary, (segments) => {
        const expression = toExpression(segments)

        expect(parse(`-${expression}`)).toBe(-1 * parse(expression))
        expect(parse(`+${expression}`)).toBe(parse(expression))
      })
    )
  })

  it("should produce the same result for generated segments in reverse order", () => {
    fc.assert(
      fc.property(segmentsArbitrary, (segments) => {
        const expression = toExpression(segments)
        const reversedExpression = toExpression(segments.toReversed())

        expect(parse(reversedExpression)).toBe(parse(expression))
        expect(parse(`-${reversedExpression}`)).toBe(parse(`-${expression}`))
      })
    )
  })

  it("should add generated duplicate-unit segments", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...aliases),
        fc.integer({ max: 999, min: 0 }),
        fc.integer({ max: 999, min: 0 }),
        (alias, firstCount, secondCount) => {
          expect(parse(`${firstCount}${alias} ${secondCount}${alias}`)).toBe(
            parse(`${firstCount + secondCount}${alias}`)
          )
        }
      )
    )
  })

  it("should preserve bare numbers as milliseconds", () => {
    expect(parse("100")).toBe(100)
    expect(parse("0")).toBe(0)
  })

  // Alias coverage is generated from the UNITS table, so every alias is tested automatically.
  for (const unit of UNITS) {
    it(`should convert every ${unit.longPlural} alias`, () => {
      for (const alias of unit.aliases) {
        expect(parse(`1${alias}`)).toBe(unit.ms)
        expect(parse(`1 ${alias}`)).toBe(unit.ms)
        expect(parse(`2 ${alias}`)).toBe(2 * unit.ms)
      }
    })
  }

  it("should be case-insensitive", () => {
    expect(parse("1H")).toBe(3_600_000)
    expect(parse("1 Hour")).toBe(3_600_000)
    expect(parse("1 HOUR")).toBe(3_600_000)
    expect(parse("53 YeArS")).toBe(1_672_552_800_000)
    expect(parse("53 WeEkS")).toBe(32_054_400_000)
    expect(parse("53 DaYS")).toBe(4_579_200_000)
    expect(parse("53 HoUrs")).toBe(190_800_000)
    expect(parse("53 MiLliSeCondS")).toBe(53)
  })

  it("should reject M, which reads as months in other notations, and say what to write", () => {
    for (const value of ["1M", "1 M", "1h 5M", "-2M"]) {
      expect(() => parse(value)).toThrow(
        new InvalidTimeExpressionError(
          value,
          '"M" is ambiguous: use "m" for minutes or "mo" for months'
        )
      )
    }
    expect(parse("1m")).toBe(60_000)
    expect(parse("1MO")).toBe(2_629_800_000)
    expect(parse("1Ms")).toBe(1)
  })

  it("should allow multiple spaces between number and unit", () => {
    expect(parse("1   h")).toBe(3_600_000)
    expect(parse("1   s")).toBe(1000)
    expect(parse("1 h")).toBe(3_600_000)
  })

  it("should allow surrounding whitespace", () => {
    expect(parse(" 1h")).toBe(3_600_000)
    expect(parse("1h ")).toBe(3_600_000)
    expect(parse("  1h 30m  ")).toBe(5_400_000)
  })

  it("should handle decimal values", () => {
    expect(parse("1.5h")).toBe(5_400_000)
    expect(parse("1.5 hours")).toBe(5_400_000)
    expect(parse("-10.5h")).toBe(-37_800_000)
  })

  it("should handle leading-dot decimals", () => {
    expect(parse(".5ms")).toBe(0.5)
    expect(parse("-.5h")).toBe(-1_800_000)
  })

  it("should handle exponent notation", () => {
    expect(parse("1e3ms")).toBe(1000)
    expect(parse("1e2s")).toBe(100_000)
    expect(parse("-2.5e2s")).toBe(-250_000)
    expect(parse("+1E2m")).toBe(6_000_000)
    expect(parse("1e2m30s")).toBe(6_030_000)
    expect(parse("1e-3s")).toBe(1)
  })

  it("should handle negative values", () => {
    expect(parse("-100ms")).toBe(-100)
    expect(parse("-1.5h")).toBe(-5_400_000)
    expect(parse("-500ms")).toBe(-500)
  })

  it("should parse space-separated compound expressions", () => {
    expect(parse("1h 30m")).toBe(5_400_000)
  })

  it("should parse comma-separated compound expressions", () => {
    expect(parse("1h, 30m, 15s")).toBe(5_415_000)
    expect(parse("1h,30m")).toBe(5_400_000)
  })

  it("should parse compound expressions with no separator", () => {
    expect(parse("1h30m")).toBe(5_400_000)
    expect(parse("1h0.5m")).toBe(3_630_000)
  })

  it("should parse a leading-dot segment after a separator", () => {
    expect(parse("1h .5m")).toBe(3_630_000)
    expect(parse("1h, .5m")).toBe(3_630_000)
  })

  it("should reject a leading-dot segment with no separator", () => {
    expect(() => parse("1h.5m")).toThrow(
      /a segment that follows another segment with no separator must start with a digit/
    )
    expect(() => parse("1.5h.5m")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1.5.5h")).toThrow(InvalidTimeExpressionError)
  })

  it("should reject generated leading-dot segments with no separator", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...aliases),
        fc.constantFrom(...aliases),
        fc.integer({ max: 999, min: 1 }),
        (first, second, fractional) => {
          expect(safeParse(`1${first}.${fractional}${second}`)).toBeNull()
        }
      )
    )
  })

  it("should parse long-form compound expressions", () => {
    expect(parse("1 hour 30 minutes")).toBe(5_400_000)
    expect(parse("1 year 2 weeks 5 days")).toBe(31_557_600_000 + 2 * 604_800_000 + 5 * 86_400_000)
  })

  it("should parse mixed short and long forms", () => {
    expect(parse("1 hour, 30m")).toBe(5_400_000)
  })

  it("should sum duplicate units", () => {
    expect(parse("1h 2h")).toBe(10_800_000)
  })

  it("should be order-independent", () => {
    expect(parse("30m 1h")).toBe(parse("1h 30m"))
    expect(parse("-30m 1h")).toBe(parse("-1h 30m"))
  })

  it("should parse complex compound expressions", () => {
    expect(parse("1 day, 6 hours, 30 minutes")).toBe(109_800_000)
    expect(parse("1d 6h 30m")).toBe(109_800_000)
  })

  it("should apply a single leading sign to the whole expression", () => {
    expect(parse("-1h 30m")).toBe(-5_400_000)
    expect(parse("-1h30m")).toBe(-5_400_000)
    expect(parse("-1 hour 30 minutes")).toBe(-5_400_000)
    expect(parse("+1h 30m")).toBe(5_400_000)
    expect(parse("+1h30m")).toBe(5_400_000)
  })

  it("should reject signs on later segments", () => {
    expect(() => parse("-1h -30m")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("-1h +30m")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1h-30m")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1h+30m")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("30m -1h")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("-1h,30m,-10m")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1h -30m")).toThrow(/only one leading sign is allowed/)
  })

  it("should reject a detached leading sign", () => {
    expect(() => parse("- 1h")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("+ 1h")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("-")).toThrow(InvalidTimeExpressionError)
  })

  it("should throw for exponent overflow and non-finite totals", () => {
    expect(() => parse("1e309ms")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("-1e309ms")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1e309s")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1e400y")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1e308y")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1e308ms 1e308ms")).toThrow(/overflows/)
  })

  it("should throw for empty string", () => {
    expect(() => parse("")).toThrow(InvalidTimeExpressionError)
  })

  it("should throw for string exceeding 200 characters", () => {
    expect(() => parse("a".repeat(201))).toThrow(InvalidTimeExpressionError)
  })

  it("should throw for non-string inputs", () => {
    expect(() => parse(undefined as never)).toThrow(InvalidTimeExpressionError)
    expect(() => parse(null as never)).toThrow(InvalidTimeExpressionError)
    expect(() => parse([] as never)).toThrow(InvalidTimeExpressionError)
    expect(() => parse({} as never)).toThrow(InvalidTimeExpressionError)
    expect(() => parse(100 as never)).toThrow(InvalidTimeExpressionError)
    expect(() => parse(Number.NaN as never)).toThrow(InvalidTimeExpressionError)
  })

  it("should include the invalid input in thrown messages", () => {
    expect(() => parse(Number.POSITIVE_INFINITY as never)).toThrow(/Received: Infinity/)
    expect(() => parse("foo")).toThrow(/Received: "foo"/)
  })

  it("should expose the invalid input on the error", () => {
    try {
      parse("foo")
      throw new Error("expected parse to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTimeExpressionError)
      expect((error as InvalidTimeExpressionError).value).toBe("foo")
      expect((error as InvalidTimeExpressionError).name).toBe("InvalidTimeExpressionError")
    }
  })

  it("should throw for unparseable strings", () => {
    expect(() => parse("☃")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("10-.5")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("ms")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("foo")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("0x1h")).toThrow(InvalidTimeExpressionError)
  })

  it("should throw when garbage is mixed with valid segments", () => {
    expect(() => parse("1h foo 30m")).toThrow(InvalidTimeExpressionError)
  })

  it("should throw for bare numbers in compound expressions", () => {
    expect(() => parse("1h 30")).toThrow(/every segment in a compound expression must have a unit/)
    expect(() => parse("30 1h")).toThrow(InvalidTimeExpressionError)
  })

  it("should throw for malformed comma separators", () => {
    expect(() => parse(",1h")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1h,")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1h,,30m")).toThrow(InvalidTimeExpressionError)
    expect(() => parse("1h, ,30m")).toThrow(InvalidTimeExpressionError)
  })
})

describe("safeParse", () => {
  it("should return the parsed value for valid expressions", () => {
    expect(safeParse("1h")).toBe(3_600_000)
    expect(safeParse("1h 30m")).toBe(5_400_000)
    expect(safeParse("-1h 30m")).toBe(-5_400_000)
    expect(safeParse("100")).toBe(100)
  })

  it("should return null for invalid expressions", () => {
    expect(safeParse("foo")).toBeNull()
    expect(safeParse("")).toBeNull()
    expect(safeParse("1h -30m")).toBeNull()
    expect(safeParse("1e309ms")).toBeNull()
    expect(safeParse("a".repeat(201))).toBeNull()
  })

  it("should return null for non-string inputs at runtime", () => {
    expect(safeParse(undefined as never)).toBeNull()
    expect(safeParse(null as never)).toBeNull()
    expect(safeParse(123 as never)).toBeNull()
  })
})
