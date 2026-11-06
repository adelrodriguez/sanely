#!/bin/sh
# Creates or updates the `main` ruleset on this repository's GitHub remote: no deletion or force
# push, changes through pull requests, and every CI job must pass. Requires the GitHub CLI.

set -eu

repository=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
existing=$(gh api "repos/$repository/rulesets" --jq '.[] | select(.name == "main") | .id')

ruleset='{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "check", "integration_id": 15368 },
          { "context": "analyze", "integration_id": 15368 },
          { "context": "unit", "integration_id": 15368 },
          { "context": "compat", "integration_id": 15368 },
          { "context": "build", "integration_id": 15368 }
        ]
      }
    },
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["merge", "squash", "rebase"],
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": false
      }
    }
  ]
}'

if [ -n "$existing" ]; then
  printf '%s' "$ruleset" | gh api --method PUT "repos/$repository/rulesets/$existing" --input - >/dev/null
  printf 'Updated the main ruleset on %s.\n' "$repository"
else
  printf '%s' "$ruleset" | gh api --method POST "repos/$repository/rulesets" --input - >/dev/null
  printf 'Created the main ruleset on %s.\n' "$repository"
fi
