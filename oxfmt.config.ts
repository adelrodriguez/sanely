import format from "adamantite/format"
import { defineConfig } from "oxfmt"

export default defineConfig({
  ...format,
  // Generator templates are source files with Handlebars placeholders, not Handlebars HTML.
  ignorePatterns: ["**/*.hbs"],
})
