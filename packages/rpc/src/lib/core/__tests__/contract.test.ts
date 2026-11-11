import { describe, expect, test } from "vitest"
import * as z from "zod"
import { createClient } from "#lib/client/index.ts"
import { defineContract, channel, flatten, type OneWayContract } from "#lib/core/contract.ts"
import { SetupError } from "#lib/core/setup-error.ts"
import { implement } from "#lib/server/implement.ts"
import { createRouter } from "#lib/server/router.ts"

describe("channel", () => {
  test("a bare schema builds a one-way leaf", () => {
    const schema = z.object({ id: z.string() })
    const leaf = channel(schema)

    expect(leaf.input).toBe(schema)
    expect(leaf.output).toBeUndefined()
  })

  test("input and output build a round-trip leaf", () => {
    const input = z.void()
    const output = z.string()
    const leaf = channel({ input, output })

    expect(leaf.input).toBe(input)
    expect(leaf.output).toBe(output)
  })
})

const acceptsOneWay = (tree: OneWayContract) => tree

describe("OneWayContract", () => {
  test("accepts one-way trees and rejects round-trip leaves at compile time", () => {
    const oneWay = defineContract({
      stripe: { checkout: { created: channel(z.object({ id: z.string() })) } },
    })

    expect(acceptsOneWay(oneWay)).toBe(oneWay)

    // @ts-expect-error a leaf with an `output` schema is a round trip, not one-way
    acceptsOneWay(defineContract({ ask: channel({ input: z.string(), output: z.string() }) }))
  })
})

describe("defineContract", () => {
  test("returns the tree unchanged", () => {
    const tree = {
      localFiles: {
        open: channel({ input: z.void(), output: z.string() }),
      },
    }

    expect(defineContract(tree)).toBe(tree)
  })

  test.each(["$path", "$schema", "_kind", "then", "toJSON"])("rejects reserved key %s", (key) => {
    expect(() =>
      defineContract({
        stripe: { [key]: channel(z.object({ id: z.string() })) },
      })
    ).toThrow(`Reserved key "${key}" at "stripe.${key}"`)
  })

  test("raises SetupError with the key and path", () => {
    const error = (() => {
      try {
        defineContract({ stripe: { $path: channel(z.string()) } })
        return null
      } catch (error) {
        return error
      }
    })()

    expect(error).toBeInstanceOf(SetupError)
    expect(error).toMatchObject({ code: "reserved-key", key: "$path", path: "stripe.$path" })
  })

  test("rejects reserved keys used as branches", () => {
    expect(() =>
      defineContract({
        $helpers: { created: channel(z.object({ id: z.string() })) },
      })
    ).toThrow('Reserved key "$helpers"')
  })

  test("rejects keys containing a dot", () => {
    expect(() =>
      defineContract({
        stripe: { "checkout.created": channel(z.object({ id: z.string() })) },
      })
    ).toThrow(
      'Key "checkout.created" at "stripe.checkout.created" in contract must not contain "."'
    )
  })

  test("allows publish as an ordinary key", () => {
    const tree = defineContract({
      publish: { created: channel(z.object({ id: z.string() })) },
    })

    expect(Object.keys(flatten(tree))).toEqual(["publish.created"])
  })
})

describe("contracts not built with defineContract", () => {
  // A plain object skips defineContract, so every entry point must apply its key rules itself.
  const colliding = {
    a: { b: channel({ input: z.number(), output: z.number() }) },
    "a.b": channel({ input: z.string(), output: z.string() }),
  }

  test.each([
    ["createClient", () => createClient(colliding, () => null)],
    ["createRouter", () => createRouter(colliding, { "a.b": () => null } as never)],
    ["implement", () => implement(colliding)],
  ])("%s rejects a dotted key", (_name, build) => {
    expect(build).toThrow(expect.objectContaining({ code: "dotted-key", key: "a.b" }))
  })

  test("createClient rejects a reserved key", () => {
    expect(() => createClient({ files: { $open: channel(z.string()) } }, () => null)).toThrow(
      expect.objectContaining({ code: "reserved-key", key: "$open" })
    )
  })
})

describe("flatten", () => {
  test("flattens nested leaves into dotted paths", () => {
    const open = channel({ input: z.void(), output: z.string() })
    const created = channel(z.object({ id: z.string() }))

    const result = flatten({
      localFiles: { open },
      stripe: { checkout: { created } },
    })

    expect(Object.keys(result).toSorted()).toEqual(["localFiles.open", "stripe.checkout.created"])
    expect(result["localFiles.open"]).toBe(open)
    expect(result["stripe.checkout.created"]).toBe(created)
  })
})
