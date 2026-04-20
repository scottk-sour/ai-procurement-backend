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
- Render auto-deploys from main
- Node 22.x, npm install on deploy

## Large file rule
Files 400+ lines: split refactors into two commits to avoid
session timeouts.

## Testing
Run TypeScript checks before pushing if applicable. Manual
testing via Postman or the live frontend.
