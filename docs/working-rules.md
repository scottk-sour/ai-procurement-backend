# Working Rules — Detailed

These rules apply to every repository audit, implementation, test run, PR,
and deployment decision. The summary version lives in `CLAUDE.md`; this file
holds the detail.

---

## 1. Verify, don't infer

Current repository state is authoritative.

Do not treat the prompt, a previous audit, a PR description, a commit
message, or an earlier finding as proof that something currently exists or
is true. Previous findings may have been correct when written and stale by
the time you inspect the repository.

For every material claim:

1. Verify it against the current repository.
2. Cite the file, relevant lines, and surrounding context.
3. If runtime behaviour matters, verify the served behaviour rather than
   relying on source alone.
4. If the fact cannot be verified: state exactly what is missing, state what
   evidence would settle it, stop that line of inquiry, and do not
   substitute an assumption.

**Never invent** a commit hash, branch, filename, route, function, variable,
database or API field, figure, price, date, product name, capability,
outcome, Schema.org property, schema mapping, regulatory fact, test result,
or deployment status.

If the repository does not contain what is required to make a safe decision,
say so.

Absence is evidence only when the search was sufficiently exhaustive. Do not
claim something does not exist on the strength of checking one obvious
location.

---

## 2. Audit before implementing

For anything beyond a trivial, unambiguous change, the first response is
read-only.

The first response must inspect the relevant current code, establish the
actual state, identify relevant dependencies, distinguish confirmed facts
from uncertainty, report intended changes, and identify anything requiring a
decision. Then stop.

Do not, in the first response: modify files, create branches, commit, push,
open or update a PR, deploy, modify tests, create abstractions, or perform
opportunistic cleanup.

Implementation begins only after explicit authorisation. If the
authorisation is ambiguous, stop and ask.

---

## 3. Scope is a hard boundary

The requested scope defines the work. A discovered issue is a finding, not
permission to fix it.

If an adjacent problem is found: report it, identify its file and impact,
state whether it is inside or outside the current scope, and leave it
unchanged unless explicitly authorised.

Do not expand the task because doing so appears cleaner, safer, or more
consistent.

If the authorised change exposes a dependency in another file, report the
dependency and do not silently modify that file.

---

## 4. Text replacement must be context-aware

Never perform a blind global find-and-replace.

The same string may appear in product copy, competitor descriptions,
structured data, metadata, explanatory text, fixtures, tests, deliberate
exclusions, or negative statements.

Before changing a repeated string:

1. Search for every occurrence in the relevant scope.
2. Classify each occurrence.
3. Identify the exact occurrence or occurrences authorised for change.
4. Anchor the edit using surrounding context.
5. Re-search after implementation.
6. Report material occurrences that remain unchanged, and why.

A string appearing in the repository does not, by itself, establish that it
should be changed.

---

## 5. Contradicted vs absent

**CONTRADICTED** — the authoritative source establishes a different value.
Example: code says six platforms, `/pricing` establishes three. A correction
can use the authoritative value.

**ABSENT / UNSUPPORTED** — the authoritative source does not establish the
claim either way. Example: code says automated publishing, `/pricing`
establishes that implementation happens but says nothing about automation.

Do not conclude that an absent claim is false. If no authoritative
replacement exists, remove the unsupported claim, or stop and ask if removal
would alter the intended meaning.

Never convert an unsupported claim into a supposedly factual opposite.

---

## 6. Authoritative sources

When correcting a proposition, establish the appropriate source of truth
from the current repository.

Do not assume a source is authoritative merely because the prompt calls it
authoritative. Verify that the file exists, that the relevant value is
actually present, that the code path uses it, and that the value represents
the same product or entity being corrected.

Where multiple sources disagree, report the disagreement before
implementing. Do not resolve it by choosing whichever value makes the code
easiest to fix.

---

## 7. Structured data

Treat machine-readable claims as claims made to crawlers and downstream
systems.

For JSON-LD and Schema.org changes:

- Identify the exact object and `@type`.
- Establish what entity the object describes.
- Distinguish TendorAI's claims from competitor or third-party claims.
- Verify every changed property against an authoritative repository source.
- Do not invent Schema.org properties or mappings.
- Do not add properties merely because they appear useful.
- Do not assume a visible marketing statement automatically belongs in
  structured data.

Where practical, verify the served JSON-LD rather than the source. If source
and served output differ, report the difference.

---

## 8. Runtime verification

Do not claim runtime behaviour from source inspection alone when it can
reasonably be tested.

Use the strongest available evidence, in this order:

1. Served production or preview HTML
2. Locally served HTML
3. Direct runtime or API output
4. Source inspection

State which level was actually verified.

If runtime verification is impossible, explain why, identify the missing
dependency or environment, and state what would settle it. Do not present
source inspection as runtime verification.

---

## 9. Tests and failing checks

Run the relevant available checks after implementation.

If a test, build, lint, type check, or other verification fails:

1. Record the exact failure.
2. Establish whether the same failure exists on the unmodified base commit.
3. Reproduce it on the clean base where practical.
4. Only then classify it as pre-existing.

Never call a failure pre-existing merely because it looks unrelated.

Never weaken a test, delete a test, change an assertion, alter configuration
solely to make a check pass, suppress an error, or claim success when the
command failed.

Report both the command and its actual result.

---

## 10. Git and PR discipline

Unless explicitly authorised otherwise:

- Branch from the verified base commit.
- Do not assume the branch or commit named in the prompt still exists —
  verify the actual base before changing anything.
- Keep unrelated working-tree changes untouched.
- Inspect `git status` and the final diff before reporting completion.

For PR work: create or update the PR only when authorised, do not merge
unless explicitly authorised, do not deploy unless explicitly authorised,
and never treat opening a PR as permission to merge it.

If the prompt specifies a commit hash, branch, or PR, verify it rather than
assuming it.

---

## 11. Deployment

**Backend — Render.** Auto-deploy is OFF. Deployment is manual. Always
remind Scott that a backend change requires a manual deploy. Do not claim a
backend change is deployed unless deployment has actually been performed and
verified.

**Frontend — Vercel.** Merging a PR triggers an automatic deployment.
Therefore do not merge frontend PRs unless merge has been explicitly
authorised. A PR stays open for review when merge has not been authorised.

---

## 12. Final verification before reporting completion

**Scope** — only authorised files changed; no unexpected files changed; no
new files created unless authorised; no unrelated cleanup.

**Code** — every authorised change present; no unauthorised change present;
repeated strings handled contextually; remaining occurrences classified.

**Tests** — relevant checks run; failures reproduced against the clean base
where necessary; no tests weakened.

**Runtime** — served behaviour verified where possible; limitations
explicitly stated.

**Git** — final diff reviewed; branch and base verified; commit verified; PR
status verified; merge status verified; deployment status verified.

Verify the actual diff, not your intended changes. Never report an
assumption as a verification result.

---

## 13. Stop conditions

Stop rather than guess if:

- A required source does not exist.
- Two authoritative sources conflict.
- A schema property does not exist.
- A replacement value cannot be sourced.
- The purpose of a schema object is unclear.
- Runtime behaviour cannot be established and runtime evidence is necessary.
- The requested change would require an unauthorised file.
- The scope boundary becomes ambiguous.
- The current repository contradicts the premise of the task.

When stopping, state:

**What is known → what is missing → what would settle it → what decision or
authorisation is required.**

Do not fill the gap with a plausible answer.
