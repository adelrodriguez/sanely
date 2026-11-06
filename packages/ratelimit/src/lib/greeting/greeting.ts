import { InvalidNameError } from "#lib/shared/errors.ts"

export function greet(name: string) {
  const trimmed = name.trim()

  if (trimmed === "") {
    throw new InvalidNameError(name)
  }

  return `Hello, ${trimmed}!` as const
}
