# `@sanely/core`

`@sanely/core` holds the definitions that several Sanely libraries share. It is a private workspace that is never published to npm. Each library that uses core bundles core's JavaScript and declarations into its own build.

The `@sanely/core/time` entry point provides the time units, their aliases and lookups, millisecond conversion constants, nominal clock ratios, and the types derived from the unit table.

Before you change the package, read the [architecture](docs/architecture.md), the [testing guide](docs/testing.md), and [Share internal code](../../CONTRIBUTING.md#share-internal-code) in the contributor guide.
