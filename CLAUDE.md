## Project
Express/Node.js backend for TendorAI. MongoDB via Mongoose.
Deployed to Render from main branch.

## Architecture
Frontend is a separate repo: scottk-sour/tendorai-nextjs (Next.js).
This repo serves the API only. Do not create logic here that
belongs on the frontend.

## Critical: Two AEO Subsystems
1. routes/aeoAuditRoutes.js + models/AeoAudit.js
   = REAL detector. Fetches the site, runs HTML checks.
   Used by Pro dashboard. Blog detection lives here.

2. routes/aeoReportRoutes.js + services/aeoReportGenerator.js
   + models/AeoReport.js = LLM-GENERATED public marketing report.
   Does not fetch the site. Hallucinates gaps. Public form
   currently disabled pending rewire.

Do not mix these systems. Any work on "real" detection goes to
System 1. Do not add LLM guessing to System 1.

## Git workflow
- Claude Code pushes to feature branches, never main
- Scott reviews diff on GitHub, opens PR, merges manually
- Render does NOT auto-deploy; deploy from main is triggered manually
- Node 22.x, npm install on deploy

## Large file rule
Files 400+ lines: split refactors into two commits to avoid
session timeouts.

## Testing
Run TypeScript checks before pushing if applicable. Manual
testing via Postman or the live frontend.

## Working Rules

Verify, don't infer

Current repository state is authoritative — over prompts, previous audits, PR descriptions, commit messages, and earlier findings, all of which may be stale. Where the code contradicts what I have told you, the code wins. Report the contradiction and say which record needs correcting.

If a fact cannot be verified from the repository, say what is missing, what evidence would settle it, and stop that line of inquiry. Never fill gaps with plausible answers or invent identifiers, claims, figures, dates, prices, filenames, fields, or schema properties.

Audit before implementing

For anything beyond a trivial change, the first response is read-only: audit the current code, report findings and intended changes, then stop. Do not modify files, create branches, commit, open PRs, or deploy until explicitly authorised.

Scope is a boundary

Do not expand scope because an adjacent problem is visible. Report it and leave it alone. A finding is not permission to fix it.

Context-aware replacement

Never use blind find-and-replace. The same string may appear in different contexts, including competitor claims, examples, exclusions, metadata, and structured data. Anchor replacements to their surrounding context and report relevant occurrences that were intentionally left unchanged.

Contradicted vs absent

Distinguish between:

* CONTRADICTED — the repository contains authoritative evidence that the current claim conflicts with the current proposition. Correct it using that evidence.
* ABSENT — the repository does not establish the claim. Do not invent a replacement; remove the unsupported claim where appropriate.

Final verification

Before reporting completion, verify the actual diff and current repository state, not your intended changes. Confirm scope, changed files, tests/checks, and runtime behaviour where relevant.

Failing checks

If a test, build, or lint check fails, reproduce it against the unmodified base commit before calling it pre-existing. Never weaken, rewrite, or remove a test to obtain a pass.

Deploys

Backend (Render) does not auto-deploy — remind me that deployment must be manual.

Detailed rules for structured data, git discipline, runtime verification levels, and full completion checklists: docs/working-rules.md.
