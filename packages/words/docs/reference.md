# `@sanely/words` reference

The package has one entry point, `@sanely/words`. Every export is a named export.

## `generate`

```ts
function generate<const N extends string = never>(options?: GenerateOptions<N>): string
```

Returns a random name. With no options, the name has two words joined by `-`. The first word is a prefix, from the adjective or color list, and the second is a noun, from any other built-in list.

```ts
import { generate } from "@sanely/words"

generate() // "amber-fox"
generate({ segments: 4 }) // "tan-heron-cathedral-violin"
generate({ pattern: ["color", "animal"], separator: "_" }) // "teal_otter"
generate({ lists: { fruit: ["apple", "pear"] }, pattern: ["fruit", "animal"] }) // "pear-otter"
```

A name never repeats a word. Each word is chosen uniformly from the words of its list that are unused and still let the rest of the name fit within `maxLength`.

| Option      | Type                     | Default       | Description                                                                                       |
| ----------- | ------------------------ | ------------- | ------------------------------------------------------------------------------------------------- |
| `segments`  | `number`                 | `2`           | The number of words in a default name, from 2 to 16. Not allowed with `pattern`.                  |
| `pattern`   | `(Category \| N)[]`      | none          | The list for each word, in order. Its length sets the number of words, from 2 to 16.              |
| `lists`     | `{ [K in N]: WordList }` | none          | Custom lists that `pattern` can name. A name must not reuse a category. Needs `pattern`.          |
| `omit`      | `WordList`               | none          | Words to exclude from every list, built-in and custom.                                            |
| `separator` | `string`                 | `"-"`         | The text between words. Must not be empty.                                                        |
| `maxLength` | `number`                 | none          | The longest name allowed, separators included. A positive integer.                                |
| `random`    | `() => number`           | `Math.random` | The source of randomness. Must return a number from 0 up to, but not including, 1, on every call. |

`generate` throws `InvalidOptionError` when an option breaks a rule in the table. It throws `NotEnoughWordsError` when no name satisfies the options.

### Type-checked patterns

The type checker accepts a pattern entry only when it is a category or a key of `lists`.

```ts
generate({ pattern: ["colour", "animal"] }) // Type error: "colour" is not a category.
generate({ lists: { animal: ["cat"] }, pattern: ["animal", "color"] }) // Type error: "animal" is built in.
```

A pattern stored in a variable must keep its literal types. Write it with `as const` or a `Category[]` annotation.

```ts
const pattern = ["color", "animal"] as const

generate({ pattern })
```

A pattern from outside the code, such as a config file, is `unknown` until you check it with `isCategory`.

## `count`

```ts
function count<const N extends string = never>(options?: CountOptions<N>): bigint
```

Returns the number of distinct names that `generate` can return with the same `segments`, `pattern`, `lists`, and `omit`. The count ignores `maxLength`. It is a `bigint`, so it stays exact for any number of words.

```ts
import { count } from "@sanely/words"

count() // 1_084_149n
count({ segments: 3 }) // 2_489_125_744n
count({ pattern: ["color", "animal"] }) // 34_830n
count({ lists: { fruit: ["apple"] }, pattern: ["fruit", "fruit"] }) // 0n
```

`count` throws `InvalidOptionError` for the same options as `generate`.

`count` counts distinct combinations of words. Each combination is a distinct name unless a custom word contains the separator. For example, `"a"` with `"b-c"` and `"a-b"` with `"c"` both make `"a-b-c"`. Built-in words hold only the letters `a` to `z`.

### Use a count

Compare and format a count directly. JavaScript compares a `bigint` with a `number`.

```ts
count() > 1_000_000 // true
count().toLocaleString("en-US") // "1,084,149"
```

`JSON.stringify` and arithmetic with a `number`, such as `count() / 2` or `Math.log2(count())`, throw a `TypeError` for a `bigint`. Convert the count with `Number` first, or send it as a string.

```ts
JSON.stringify({ names: Number(count()) }) // '{"names":1084149}'
JSON.stringify({ names: String(count({ segments: 5 })) }) // keeps every digit
Math.log2(Number(count())) // about 20 bits of randomness
```

`Number` rounds a count above `Number.MAX_SAFE_INTEGER`, such as `count({ segments: 5 })`. Send a count that large as a string.

## `lists`

```ts
const lists: Readonly<Record<Category, WordList>>
```

The built-in word lists, keyed by category. Every word is lowercase ASCII letters, and no word repeats within a list. Use a list to build a custom one.

```ts
import { generate, lists } from "@sanely/words"

const pets = lists.animal.filter((word) => word !== "fox")

generate({ lists: { pets }, pattern: ["color", "pets"] })
```

| Category         | Words |
| ---------------- | ----- |
| `adjective`      | 343   |
| `animal`         | 270   |
| `architecture`   | 134   |
| `art`            | 140   |
| `city`           | 73    |
| `color`          | 129   |
| `emotion`        | 94    |
| `fantasy`        | 49    |
| `fashion`        | 111   |
| `food`           | 211   |
| `history`        | 87    |
| `literature`     | 151   |
| `music`          | 135   |
| `nature`         | 196   |
| `profession`     | 216   |
| `science`        | 152   |
| `space`          | 76    |
| `sport`          | 102   |
| `transportation` | 121   |

## `isCategory`

```ts
function isCategory(value: unknown): value is Category
```

Returns `true` when the value is the name of a built-in list. Use it to check a pattern that comes from outside the code.

```ts
import { generate, isCategory } from "@sanely/words"

const pattern: unknown = JSON.parse(input)

if (Array.isArray(pattern) && pattern.every((entry) => isCategory(entry))) {
  generate({ pattern })
}
```

## Errors

### `InvalidOptionError`

Thrown when an option is invalid. `option` names the option, such as `"separator"` or `"pattern[1]"`, and `value` holds the invalid value.

### `NotEnoughWordsError`

Thrown by `generate` when no name satisfies the options. `reason` is one of these values:

- `"unique"`: the lists hold too few distinct words for the pattern, after `omit`.
- `"maxLength"`: no name from the lists fits within `maxLength`.

## Types

| Type                   | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `Category`             | The name of a built-in list.                                 |
| `WordList`             | `readonly string[]`.                                         |
| `GenerateOptions<N>`   | The options of `generate`. `N` is the names of custom lists. |
| `CountOptions<N>`      | The options of `count`. `N` is the names of custom lists.    |
| `NotEnoughWordsReason` | `"maxLength" \| "unique"`.                                   |
