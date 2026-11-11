<div align="center">
  <h1 align="center">🎲 <code>@sanely/words</code></h1>

  <p align="center">
    <strong>Generate friendly, safe-for-work names from curated word lists</strong>
  </p>

  <p align="center">
    <a href="https://www.npmjs.com/package/@sanely/words"><img src="https://img.shields.io/npm/v/@sanely/words" alt="npm version"></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/github/license/adelrodriguez/sanely" alt="license"></a>
  </p>
</div>

`@sanely/words` is a TypeScript package for friendly names. It returns names such as `"amber-fox"` for projects, usernames, labels, and demo data, with words drawn from curated, safe-for-work lists.

## Features

- `generate()` returns a random name, and `count()` returns how many distinct names the same options allow.
- `pattern` picks the list for each word, such as `["color", "animal"]`, and the type checker rejects a misspelled list name.
- `lists` adds custom word lists that a pattern can name.
- `maxLength` limits the length of the name, and `omit` excludes words.
- `random` takes a seeded source of randomness, so a test can repeat a name.
- Invalid options throw `InvalidOptionError`, and options that no name satisfies throw `NotEnoughWordsError`.
- No external dependencies.

## Install

```sh
npm install @sanely/words
```

The package needs Node.js 20 or later.

## Get started

```ts
import { count, generate } from "@sanely/words"

generate() // "amber-fox"
generate({ segments: 3, separator: "_" }) // "teal_heron_cathedral"
generate({ pattern: ["color", "animal"] }) // "teal-otter"
generate({ lists: { fruit: ["apple", "pear"] }, pattern: ["fruit", "animal"] }) // "pear-otter"
generate({ maxLength: 10 }) // "tan-heron"

count() // 1_084_149
```

## Documentation

Reference:

- [`@sanely/words` reference](docs/reference.md)

## Contributing

Read the [architecture](docs/architecture.md), [testing guide](docs/testing.md), and root [contributor guide](../../CONTRIBUTING.md) before changing the package.

## Credits

The word lists start from [joyful](https://github.com/KayleeWilliams/joyful) by Hayden Bleasel and Kaylee Williams, which builds on [friendly-words](https://github.com/glitchdotcom/friendly-words) by Glitch. They were filtered for safe, common words and extended with words from [coolname](https://github.com/alexanderlukanin13/coolname), [imsky/wordlists](https://github.com/imsky/wordlists), [moniker](https://github.com/technosophos/moniker), [random-word-slugs](https://github.com/nas5w/random-word-slugs), and [unique-names-generator](https://github.com/andreasonny83/unique-names-generator).

## License

MIT. See [LICENSE](LICENSE), which includes the notices for the word lists.
