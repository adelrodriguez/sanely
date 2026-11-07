import { execFileSync } from "node:child_process"
import { existsSync, rmSync, writeFileSync } from "node:fs"
import type * as FaultErrorsContract from "../src/errors"
import type * as FaultContract from "../src/index"

const rootSpecifier = "@sanely/errors"
const errorsSpecifier = "@sanely/errors/errors"
const typesSpecifier = "@sanely/errors/types"

const Fault = (await import(rootSpecifier)) as typeof FaultContract
const FaultErrors = (await import(errorsSpecifier)) as typeof FaultErrorsContract
const FaultTypes = (await import(typesSpecifier)) as object

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
    "Fault",
    "Tagged",
    "findCause",
    "fromSerializable",
    "isFault",
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
    "RegistryMergeConflictError",
    "RegistryTagMismatchError",
    "ReservedFieldError",
  ],
  "@sanely/errors/errors"
)
assertExports(FaultTypes, [], "@sanely/errors/types")

class InvalidFieldError extends Fault.Tagged("InvalidFieldError")<{ message: string }>() {}

let thrown: unknown
try {
  const invalidFieldError = new InvalidFieldError({ message: "reserved" })
  void invalidFieldError
} catch (error) {
  thrown = error
}

if (!(thrown instanceof FaultErrors.ReservedFieldError)) {
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
import { ReservedFieldError } from "@sanely/errors/errors"
import type { FaultRegistry, SerializableFault } from "@sanely/errors/types"

class ConsumerError extends Tagged("ConsumerError")() {}

const ConsumerFault = registry({ ConsumerError })
const registryContract: FaultRegistry<{ readonly ConsumerError: typeof ConsumerError }> = ConsumerFault
const serialized: SerializableFault = ConsumerFault.create("ConsumerError").toSerializable()

void registryContract
void serialized
void ReservedFieldError
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
