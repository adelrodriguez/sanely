<div align="center">
  <h1 align="center">🕰️ <code>@sanely/core</code></h1>

  <p align="center">
    <strong>Shared time units, aliases, and conversion constants for the Sanely libraries</strong>
  </p>

  <p align="center">
    <a href="../../LICENSE"><img src="https://img.shields.io/github/license/adelrodriguez/sanely" alt="license"></a>
  </p>
</div>

`@sanely/core` holds the definitions that several Sanely libraries share, with no runtime dependencies. Its `@sanely/core/time` entry point provides the time units, their aliases and lookups, millisecond conversion constants, nominal clock ratios, and the types derived from the unit table.

The Sanely libraries bundle their own copy of core, so you don't need to install core to use them.

## Features

- Millisecond constants, such as `MS_PER_MINUTE`, replace hand-written numbers like `60_000`.
- `UNITS` lists eight units, from years to milliseconds, with their names and aliases.
- `findUnit` looks up a unit alias in any casing, such as `"h"` or `"Hours"`, and rejects the ambiguous `"M"`.
- `getUnitByName` looks up a unit by its unit name, such as `"hours"`.
- Types such as `Unit`, `UnitName`, and `Hours` check unit strings at compile time.

## Install

```bash
npm install @sanely/core
```

The package needs Node.js 20 or later.

## Get started

```ts
import { findUnit, MS_PER_MINUTE, MS_PER_SECOND } from "@sanely/core/time"

const timeout = 30 * MS_PER_SECOND // 30_000
const interval = 5 * MS_PER_MINUTE // 300_000

findUnit("h")?.ms // 3_600_000
```

See the [reference](docs/reference.md) for every export.

## Development

Read the [architecture](docs/architecture.md) before you change source ownership and the [testing guide](docs/testing.md) before you add tests. [Share internal code](../../CONTRIBUTING.md#share-internal-code) in the contributor guide explains how a library uses core.
