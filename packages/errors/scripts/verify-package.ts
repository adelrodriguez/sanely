import { execFileSync } from "node:child_process"
import { existsSync, rmSync, writeFileSync } from "node:fs"

const rootSpecifier = "@sanely/errors"
const errorsSpecifier = "@sanely/errors/errors"
const typesSpecifier = "@sanely/errors/types"

// The specifiers resolve to the built package, which the type checker does not read, so each
// module is checked at run time.
const Fault: object = await import(rootSpecifier)
const FaultErrors: object = await import(errorsSpecifier)
const FaultTypes: object = await import(typesSpecifier)

function assertExports(namespace: object, expected: string[], entrypoint: string): void {
  const actual = Object.keys(namespace)
  const hasExpectedExports =
    actual.length === expected.length && expected.every((name) => Object.hasOwn(namespace, name))

  if (!hasExpectedExports) {
    throw new Error(`Unexpected ${entrypoint} exports: ${actual.join(", ")}`)
  }
}

assertExports(
  Fault,
  [
    "Base",
    "Tagged",
    "findCause",
    "fromSerializable",
    "is",
    "isFault",
    "isSerializable",
    "isSerializableFault",
    "matchTag",
    "matchTags",
    "merge",
    "registry",
    "toSerializable",
  ],
  "@sanely/errors"
)
assertExports(
  FaultErrors,
  [
    "InvalidPayloadError",
    "RegistryConstructorError",
    "RegistryMergeConflictError",
    "RegistryNotRecognizedError",
    "RegistryTagMismatchError",
    "RegistryUnknownTagError",
  ],
  "@sanely/errors/errors"
)
assertExports(FaultTypes, [], "@sanely/errors/types")

const fromSerializable: unknown = "fromSerializable" in Fault ? Fault.fromSerializable : undefined
const InvalidPayloadError: unknown =
  "InvalidPayloadError" in FaultErrors ? FaultErrors.InvalidPayloadError : undefined

if (typeof fromSerializable !== "function" || typeof InvalidPayloadError !== "function") {
  throw new Error("fromSerializable and InvalidPayloadError must be functions")
}

let thrown: unknown
try {
  fromSerializable.call(Fault, { __fault: false })
} catch (error) {
  thrown = error
}

if (!(thrown instanceof InvalidPayloadError)) {
  throw new Error("Root behavior and @sanely/errors/errors do not share error constructor identity")
}

const outputPaths = [
  "dist/errors.d.ts",
  "dist/errors.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/types.d.ts",
  "dist/types.js",
] as const

for (const path of outputPaths) {
  if (!existsSync(path)) throw new Error(`Missing package output: ${path}`)
}

const consumerPath = "dist/node-next-consumer.ts"
writeFileSync(
  consumerPath,
  `import { Tagged, registry } from "@sanely/errors"
import { InvalidPayloadError } from "@sanely/errors/errors"
import type { FaultRegistry, SerializableFault } from "@sanely/errors/types"

class ConsumerError extends Tagged("ConsumerError")() {}

const ConsumerFault = registry({ ConsumerError })
const registryContract: FaultRegistry<{ readonly ConsumerError: typeof ConsumerError }> = ConsumerFault
const serialized: SerializableFault = ConsumerFault.create("ConsumerError").toSerializable()

void registryContract
void serialized
void InvalidPayloadError
`
)

try {
  execFileSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "false",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ESNext",
      consumerPath,
    ],
    { stdio: "inherit" }
  )
} finally {
  rmSync(consumerPath, { force: true })
}
