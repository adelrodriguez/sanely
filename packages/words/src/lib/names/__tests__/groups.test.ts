import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { groupWords, shortestFill } from "#lib/names/groups.ts"
import { allNames } from "./brute-force"

const smallPools = fc.array(
  fc.uniqueArray(fc.stringMatching(/^[a-e]{1,4}$/u), { maxLength: 5, minLength: 1 }),
  { maxLength: 4, minLength: 1 }
)

describe("groupWords", () => {
  it("puts each word in the group of exactly the positions that hold it", () => {
    const groups = groupWords([
      ["ant", "bee", "cat"],
      ["bee", "dog"],
    ])

    expect(groups.map((group) => [[...group.positions], group.words])).toEqual([
      [[0], ["ant", "cat"]],
      [[0, 1], ["bee"]],
      [[1], ["dog"]],
    ])
  })

  it("sorts the words of a group from shortest to longest", () => {
    const [group] = groupWords([["otter", "ox", "owl"]])

    expect(group?.words).toEqual(["ox", "owl", "otter"])
  })
})

describe("shortestFill", () => {
  it("matches the shortest name found by enumeration", () => {
    fc.assert(
      fc.property(smallPools, (pools) => {
        const lengths = allNames(pools).map((words) => words.join("").length)
        const expected = Math.min(...lengths)

        expect(shortestFill(groupWords(pools), 0, pools.length, new Set())).toBe(expected)
      })
    )
  })

  it("skips used words", () => {
    const pools = [
      ["ox", "owl"],
      ["ox", "otter"],
    ]

    expect(shortestFill(groupWords(pools), 1, 2, new Set(["ox"]))).toBe("otter".length)
  })

  it("returns Infinity when the positions need more distinct words than exist", () => {
    expect(shortestFill(groupWords([["ox"], ["ox"]]), 0, 2, new Set())).toBe(
      Number.POSITIVE_INFINITY
    )
  })
})
