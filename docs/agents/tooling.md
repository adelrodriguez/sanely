# Tooling

<!-- ADAMANTITE:START -->

## Adamantite

Use the [root scripts](../../README.md#scripts) for formatting, lint, types, and dependency analysis.

To add a project-specific lint rule, run `pnpm exec adamantite rule add <name>`.
Read the generated guidance in `.adamantite/rules/AGENTS.md` before you implement the rule.
Each rule has its own file in `.adamantite/rules/`.

Run `pnpm exec adamantite doctor` to inspect the managed setup.

<!-- ADAMANTITE:END -->

<!-- PACKREF:START -->

## Packref

Use Packref when you need a dependency's exact source implementation or need to compare referenced versions.
Read the local `packref` skill. If it is missing, install it with:

```sh
npx -y skills add https://github.com/adelrodriguez/packref/tree/v0.3.7 --skill packref --yes
```

Packref is a root devDependency. Run it as `pnpm packref <command>` in place of the skill's `npx -y packref <command>`, so every command uses the version in `package.json`.

Run `remove`, `prune`, `clean`, or `clean --global` only when the user requests that removal scope, because these commands delete state.

<!-- PACKREF:END -->
