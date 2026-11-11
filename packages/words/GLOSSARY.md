# `@sanely/words` glossary

`@sanely/words` builds friendly names from word lists. Use these terms, with these meanings, in code, tests, issues, and docs.

## Language

**Name**:
The string that `generate` returns: one word for each position, joined by the separator. A name never repeats a word.
_Avoid_: Slug, identifier, phrase

**Word list**:
A list of words that a name can draw from. A word list is built in or custom.
_Avoid_: Dictionary, pool (in public docs), word set

**Category**:
The name of a built-in word list, such as `animal` or `color`.
_Avoid_: Type, kind, topic

**Custom list**:
A word list that the caller passes in `lists`, under a name that a pattern can use. A custom list never replaces a built-in one.
_Avoid_: Override, extra list

**Pattern**:
The ordered names of the word lists that a name draws its words from, one per position.
_Avoid_: Template, format, recipe

**Segment**:
One word position in a default name. `segments` sets how many there are when no pattern is given.
_Avoid_: Part, slot

**Prefix**:
The first word of a default name, drawn from the adjective and color lists.
_Avoid_: Modifier, first word (in code)

**Noun**:
A later word of a default name, drawn from every built-in list except the adjective and color lists.
_Avoid_: Subject, object

**Pool**:
The distinct words that one position can take, after `omit` removes words. Pools are internal.
_Avoid_: Candidates (for the whole pool)

## Scope

The package generates and counts names. It does not check whether a name is already taken, and it does not translate words.
