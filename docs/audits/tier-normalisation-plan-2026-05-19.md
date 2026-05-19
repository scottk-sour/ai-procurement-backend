# Tier Value Normalisation Plan
## 19 May 2026

## Current state

### Schema enum values (models/Vendor.js)

**Top-level `tier` field:**
```
enum: ['free', 'starter', 'pro', 'basic', 'managed', 'enterprise', 'listed', 'visible', 'verified']
default: 'free'
```

**Nested `account.tier` field:**
```
enum: ['bronze', 'silver', 'gold', 'platinum', 'standard']
default: 'standard'
```

Two completely different enum sets on the same model for the same concept.

### Production DB values (cannot query from sandbox — run locally)

```bash
node -e "import dotenv from 'dotenv'; dotenv.config(); import mongoose from 'mongoose'; await mongoose.connect(process.env.MONGODB_URI); const tiers = await mongoose.connection.db.collection('vendors').aggregate([{ \$group: { _id: '\$tier', count: { \$sum: 1 } } }, { \$sort: { count: -1 } }]).toArray(); console.log(tiers); process.exit(0);"
```

### PRO_TIERS definitions across the codebase (13 separate definitions)

| File | Line | Definition | Missing values |
|------|------|------------|----------------|
| services/writerAgent.js | 19 | `Set(['pro', 'managed', 'verified', 'enterprise'])` | — |
| services/detectiveAgent.js | 9 | `Set(['pro', 'managed', 'verified', 'enterprise'])` | — |
| services/listingsAgent.js | 7 | `Set(['pro', 'managed', 'verified', 'enterprise'])` | — |
| services/reviewsAgent.js | 10 | `Set(['pro', 'managed', 'verified', 'enterprise'])` | — |
| services/aiMentionScanner.js | 435 | `Set(['pro', 'managed', 'verified', 'enterprise'])` | — |
| services/weeklyProDigest.js | 8 | `['pro', 'managed', 'verified', 'enterprise']` | — |
| jobs/scheduledReports.js | 99 | `['pro', 'managed', 'verified', 'enterprise']` | — |
| jobs/writerAgent.js | 7 | `['pro', 'managed', 'verified', 'enterprise']` | — |
| routes/schemaRoutes.js | 39 | `['pro', 'managed', 'verified', 'enterprise']` | — |
| routes/aiSearchTestRoutes.js | 17 | `['pro', 'enterprise', 'managed']` | **Missing 'verified'** |
| routes/outreachRoutes.js | 335 | `['pro', 'basic', 'managed', 'verified', 'enterprise']` | Includes 'basic' |
| routes/adminRoutes.js | 135 | `['visible', 'verified', 'pro', 'basic', 'managed', 'enterprise']` | Includes 'visible' + 'basic' |
| scripts/migrateExistingVendorsToFirmFacts.js | 22 | `['managed', 'verified', 'enterprise']` | **Missing 'pro'** |

**Inconsistencies found:**
1. `routes/aiSearchTestRoutes.js:17` — missing `'verified'`
2. `scripts/migrateExistingVendorsToFirmFacts.js:22` — missing `'pro'`
3. `routes/adminRoutes.js:135` — includes `'visible'` and `'basic'`
4. `routes/outreachRoutes.js:335` — includes `'basic'`

### account.tier (legacy, PRO_ACCOUNT_TIERS)

| File | Line | Definition |
|------|------|------------|
| jobs/scheduledReports.js | 100 | `['gold', 'platinum', 'pro', 'verified']` |
| services/weeklyProDigest.js | 9 | `['gold', 'platinum', 'pro', 'verified']` |
| routes/schemaRoutes.js | 40 | `['gold', 'platinum', 'pro', 'verified']` |
| scripts/backfill-weekly-reports.js | 31 | `['gold', 'platinum', 'pro', 'verified']` |

### Stripe webhook tier assignment (routes/stripeRoutes.js)

```javascript
// Line 441:
vendor.tier = internalTier || (planId === 'pro' || planId === 'verified' ? 'managed' : 'basic');
// Line 447:
vendor.account.tier = vendor.tier === 'managed' ? 'gold' : 'silver';
```

Stripe Pro checkout → tier = `'managed'`, account.tier = `'gold'`
Stripe Starter checkout → tier = `'basic'`, account.tier = `'silver'`

## Proposed two-value schema

| Current value | Maps to | Rationale |
|---------------|---------|-----------|
| `free` | `free` | Non-paying vendor |
| `listed` | `free` | Legacy — listed but not paying |
| `starter` | `free` | Starter plan discontinued, no different from free |
| `basic` | `free` | Stripe's Starter internal name — should be free since Starter discontinued |
| `visible` | `free` | Legacy — visible listing, not paying |
| `pro` | `pro` | Paying Pro customer |
| `managed` | `pro` | Stripe Pro checkout sets this — equivalent to Pro |
| `verified` | `pro` | Demo accounts set to this — equivalent to Pro |
| `enterprise` | `pro` | Future enterprise tier — treat as Pro for now |

**Target enum:** `{ type: String, enum: ['free', 'pro'], default: 'free' }`

**account.tier to be deprecated** — all reads should use top-level `tier` only.

## Migration sequence

1. ✅ Audit complete (this PR)
2. Run migration script:
   ```javascript
   // Map all Pro-equivalent values to 'pro'
   db.vendors.updateMany({ tier: { $in: ['managed', 'verified', 'enterprise'] } }, { $set: { tier: 'pro' } })
   // Map all free-equivalent values to 'free'
   db.vendors.updateMany({ tier: { $in: ['starter', 'basic', 'listed', 'visible'] } }, { $set: { tier: 'free' } })
   ```
3. Update Stripe webhook: set `tier: 'pro'` directly (not `'managed'`)
4. Replace all 13 `PRO_TIERS` definitions with a single shared constant:
   ```javascript
   // utils/tiers.js
   export const isPro = (tier) => tier === 'pro';
   export const PRO_TIERS = ['pro'];
   ```
5. Update Vendor schema enum to `['free', 'pro']`
6. Deprecate `account.tier` — remove from all reads
7. Test sweep

## Risks

- **Stripe webhook** sets `'managed'` — must update before tightening enum
- **`account.tier`** referenced in Reporter cron query — must remove from `$or` clause
- **`'visible'`** may represent "free but publicly listed" — need to confirm no code gates on this value specifically
- **`'basic'`** is Stripe's Starter internal name — Starter plan still exists in SUBSCRIPTION_PLANS config at stripeRoutes.js:43
- **computeProfileGaps.js** uses `'starter'` tier for some gap gating — need to decide if these become `'free'` or need a `gapTier` concept

## Effort

| Task | Estimated time |
|------|---------------|
| Migration script | 30 min |
| Stripe webhook update | 15 min |
| Shared `isPro()` utility | 15 min |
| Replace 13 PRO_TIERS definitions | 30 min |
| Update Vendor schema enum | 5 min |
| Deprecate account.tier | 15 min |
| computeProfileGaps tier refactor | 30 min |
| Test updates | 30 min |
| **Total** | **~2.5 hours** |
