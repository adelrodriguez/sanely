# The lenient form is normalization only

At runtime, `parse` accepts the lenient form, but the runtime has only one grammar: the strict grammar. The lenient form is a normalizer in front of it. The normalizer changes case and whitespace, and maps each alias to exactly one canonical word (`mins` to `minutes`, `mon` to `monday`). It never adds a word, removes a word, or changes the order of words.

Thus each lenient phrase normalizes to exactly one strict phrase, and the type and the runtime cannot disagree about meaning. Words with more than one meaning (`biweekly`, `morning`) are never aliases. Days that are not in calendar order are an error, not a reorder, because the order is part of the strict form.

The singular and plural forms of a unit or a day group are spelling variants. The word before them selects the form: `every min` becomes `every minute`, and `every 5 min` becomes `every 5 minutes`.

The unit aliases are a copy of the minute and hour rows of the Humanspan unit table, so that an alias never means different units in the two packages. A test checks this.
