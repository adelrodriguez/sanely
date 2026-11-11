// Scans the built-in word lists for words that a person should review before they ship.
//
// The script reads every list in `src/lib/lists/` and reports each word that matches one of these
// checks:
//
// - deny: the word is in `scripts/deny.txt`, the words this package keeps out on purpose.
// - profanity: the word is on a profanity list.
// - contains: the word contains a profanity of four or more letters. Many are innocent, such as
//   "therapist", so review these by hand.
// - uncommon: SCOWL does not list the word among its common American English words (size 50).
// - long: the word has more than 12 letters.
//
// It exits with code 1 when a word matches deny or profanity, and prints the other checks as
// warnings.
//
// SCOWL and the profanity list are not part of this repository. Download them first:
//
// - SCOWL: http://wordlist.aspell.net/ (use the `final/` folder of the release)
// - Profanity: https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
//   (the `en` file)
//
// Usage: node scripts/scan.ts <scowl final folder> <profanity file>

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const COMMON_SIZE = 50
const MAX_LENGTH = 12
const MIN_CONTAINED = 4

const packageRoot = join(import.meta.dirname, "..")
const listsFolder = join(packageRoot, "src/lib/lists")
const [scowlFolder, profanityFile] = process.argv.slice(2)

if (scowlFolder === undefined || profanityFile === undefined) {
  console.error("Usage: node scripts/scan.ts <scowl final folder> <profanity file>")
  process.exit(2)
}

function words(text: string): string[] {
  return text
    .split(/\s+/u)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => /^[a-z]+$/u.test(word))
}

// Lines that start with "#" in deny.txt describe the group of words that follow.
const deny = new Set(
  words(
    readFileSync(join(import.meta.dirname, "deny.txt"), "utf8")
      .split("\n")
      .filter((line) => !line.startsWith("#"))
      .join("\n")
  )
)
// The profanity list has one entry per line, and some entries are phrases. Only single words can
// match a word in a list.
const profanity = new Set(
  readFileSync(profanityFile, "utf8")
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => /^[a-z]+$/u.test(line))
)
const contained = [...profanity].filter((word) => word.length >= MIN_CONTAINED)

// SCOWL names each file after its size, such as `american-words.35`. Smaller sizes hold more
// common words. The upper and proper-names files hold capitalized words, such as city names.
const common = new Set(
  readdirSync(scowlFolder)
    .filter((file) => {
      const match = /^(?:english|american)-(?:words|upper|proper-names)\.(\d+)$/u.exec(file)
      return match?.[1] !== undefined && Number(match[1]) <= COMMON_SIZE
    })
    .flatMap((file) => words(readFileSync(join(scowlFolder, file), "latin1")))
)

const failures: string[] = []
const warnings: string[] = []

for (const file of readdirSync(listsFolder).filter((name) => /^[a-z]+\.ts$/u.test(name))) {
  if (file === "index.ts") continue

  const list = file.replace(/\.ts$/u, "")
  const listWords = [...readFileSync(join(listsFolder, file), "utf8").matchAll(/"([a-z]+)"/gu)]
    .map((match) => match[1])
    .filter((word) => word !== undefined)

  for (const word of listWords) {
    if (deny.has(word)) failures.push(`${list}: ${word} (deny)`)
    if (profanity.has(word)) failures.push(`${list}: ${word} (profanity)`)

    const inside = contained.filter((bad) => bad !== word && word.includes(bad))
    if (inside.length > 0) warnings.push(`${list}: ${word} (contains ${inside.join(", ")})`)
    if (!common.has(word)) warnings.push(`${list}: ${word} (uncommon)`)
    if (word.length > MAX_LENGTH) warnings.push(`${list}: ${word} (long)`)
  }
}

console.log(warnings.length === 0 ? "No warnings." : `Warnings:\n${warnings.join("\n")}`)
console.log(failures.length === 0 ? "No failures." : `Failures:\n${failures.join("\n")}`)

if (failures.length > 0) process.exit(1)
