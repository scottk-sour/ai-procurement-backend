# Vendor Posts — Backend Audit

Companion document to `docs/posts-feature-audit.md` (v7 gap analysis, tendorai-nextjs). Answers the backend questions flagged as unknowns. Read-only audit: no code or model was changed.

Repo: `scottk-sour/ai-procurement-backend`
Branch audited: `claude/schema-first-vendor-services-iNcUh`
Backend AI SDK dependency: `@anthropic-ai/sdk ^0.74.0` (also present: `openai ^4.80.1`, `@google/generative-ai ^0.24.1`)

---

## 1. Endpoint location

`POST /api/vendors/:vendorId/posts/generate`

- **Defined:** `routes/vendorPostRoutes.js:128` (`router.post('/:vendorId/posts/generate', vendorAuth, …)`, handler body through line 241).
- **Mounted (twice):**
  - `index.js:297` → `app.use('/api/vendors', vendorPostRoutes);`
  - `index.js:298` → `app.use('/api/posts', vendorPostRoutes);`

  So the endpoint is reachable at **both**:
  - `POST /api/vendors/:vendorId/posts/generate` (the path in the frontend audit)
  - `POST /api/posts/:vendorId/posts/generate` (duplicate mount — may be legacy, worth a separate cleanup task)

- **Auth:** `vendorAuth` middleware + explicit `req.vendorId === req.params.vendorId` check (line 133).
- **Tier gate:** Must be in `{starter, pro, basic, visible, verified, managed, enterprise}` — `free` and `listed` are rejected with 403 (lines 143-147).

---

## 2. Generator prompts — verbatim

**One single LLM call.** Blog body + LinkedIn text + Facebook text are generated in a single Anthropic `messages.create` call that returns all three as a JSON object. Not three sequential calls. Not template-based for LinkedIn/Facebook.

### System prompt (`routes/vendorPostRoutes.js:168-187`)

```
You are an expert content writer for UK professional services firms.
You write in the Yadav format — a specific blog structure that performs well in AI search results.

Yadav format rules:
- Start with a bold statement or statistic that hooks the reader
- Use short paragraphs of 2-3 sentences maximum
- Include a clear H2 subheading every 150-200 words
- Answer the most likely reader question in the first 100 words
- Include specific numbers, percentages, or named examples where possible
- End with a clear call to action
- Write in plain English — no jargon, no passive voice
- Target length: 600-800 words for the blog post
- UK English spelling throughout

You also write LinkedIn and Facebook versions:
- LinkedIn version: 150-200 words, professional tone, ends with a question to drive comments
- Facebook version: 100-150 words, warmer tone, ends with a call to action

Always write in first person plural ("we", "our firm") as if you are the firm.
Never mention TendorAI in the content.
```

### User prompt (`routes/vendorPostRoutes.js:189-203`)

```
Write a blog post for a ${verticalLabel} firm about: ${topic.trim()}

${stats ? `Include these stats or facts: ${stats.trim()}` : ''}

Also write:
1. A LinkedIn post version (150-200 words)
2. A Facebook post version (100-150 words)

Return as JSON only with this exact structure:
{
  "title": "Blog post title",
  "body": "Full blog post in markdown",
  "linkedInText": "LinkedIn version",
  "facebookText": "Facebook version"
}
```

`${verticalLabel}` resolves from the `VERTICAL_LABELS` map (see §4). `${stats}` is an optional field from the request body; if absent, the line is empty.

---

## 3. LLM model and parameters

`routes/vendorPostRoutes.js:205-213`:

```js
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 2000,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }],
});
```

| Setting | Value |
|---|---|
| **Model** | `claude-sonnet-4-20250514` |
| **max_tokens** | `2000` |
| **temperature** | not set (default) |
| **top_p / top_k** | not set |
| **stop_sequences** | not set |
| **system** | full system prompt (§2) |
| **messages** | single user-role message with the user prompt |
| **SDK** | `@anthropic-ai/sdk` dynamically imported inside the handler |

The anthropic client is instantiated inside the request handler, so there's no shared client or cache across requests.

---

## 4. Vertical-specific variation

**Label substitution only.** No separate prompt, no different Yadav rules per vertical, no different tone.

`routes/vendorPostRoutes.js:158-166`:

```js
const vertical = vendor.vendorType || 'professional services';
const VERTICAL_LABELS = {
  solicitor: 'solicitor',
  accountant: 'accountant',
  'mortgage-advisor': 'mortgage adviser',
  'estate-agent': 'estate agent',
  'office-equipment': 'office equipment supplier',
};
const verticalLabel = VERTICAL_LABELS[vertical] || vertical;
```

The label is injected once into the user prompt: `"Write a blog post for a ${verticalLabel} firm about: …"`. That's the full extent of vertical awareness in the generator. Every vendor type gets the same Yadav-format rules, the same length targets, and the same first-person-plural voice instruction.

Note: `financial-advisor` and `insurance-broker` (which are valid `vendorType` enum values on the Vendor model) are **not mapped** — they fall through to the raw vendorType string as the label.

---

## 5. Post-processing on the LLM output

`routes/vendorPostRoutes.js:215-233`:

```js
const text = response.content
  .filter(b => b.type === 'text')
  .map(b => b.text)
  .join('');

// Parse JSON from response
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  return res.status(500).json({ success: false, error: 'Failed to parse AI response' });
}

const parsed = JSON.parse(jsonMatch[0]);
res.json({
  success: true,
  title: parsed.title || '',
  body: parsed.body || '',
  linkedInText: parsed.linkedInText || '',
  facebookText: parsed.facebookText || '',
});
```

What the generate endpoint actually does to the output:

| Step | Present? |
|---|---|
| Concatenate `content[].text` blocks | ✓ |
| Regex-extract first `{…}` block (greedy, DOTALL) | ✓ |
| `JSON.parse` the extracted block | ✓ |
| Return `{title, body, linkedInText, facebookText}` — default each to `''` | ✓ |
| Markdown cleanup / sanitisation | ✗ (body is passed through as raw markdown from the LLM) |
| Length truncation against the model's `maxlength` (10000) | ✗ |
| Schema injection (JSON-LD) | ✗ |
| Slug generation | ✗ (happens later, on the model — see §6) |
| Saving to DB | ✗ (generate returns the draft to the frontend; saving happens on a separate `POST /api/vendors/:vendorId/posts`) |
| Profanity / hallucination filter | ✗ |
| Retry on parse failure | ✗ (single try → 500) |

Slug generation lives in the model's `pre('validate')` hook (`models/VendorPost.js:28-40`) and fires on `POST /api/vendors/:vendorId/posts` when the draft is saved, not at generation time.

---

## 6. VendorPost model — full field list

`models/VendorPost.js` (47 lines). Schema:

```js
{
  vendor:        ObjectId (ref Vendor, required, indexed)
  title:         String  (required, maxlength 200, trimmed)
  body:          String  (required, maxlength 10000, trimmed)
  category:      String  enum ['news','product','offer','guide','update'], default 'news'
  tags:          [String] (trimmed, lowercased)
  status:        String  enum ['draft','published','hidden'], default 'draft'
  slug:          String  (unique, indexed; auto-generated in pre('validate'))
  isDemoVendor:  Boolean (default false)
  aiGenerated:   Boolean (default false)
  topic:         String  (trimmed)
  stats:         String  (trimmed)
  linkedInText:  String  (trimmed)
  facebookText:  String  (trimmed)
  createdAt:     Date    (timestamps: true)
  updatedAt:     Date    (timestamps: true)
}
```

### Body `maxlength`

**Backend enforces 10,000 characters.** Line 6: `body: { type: String, required: true, maxlength: 10000, trim: true }`.

- Frontend audit claim "maxlength 5000" → **wrong.**
- UI counter showing 10000 → **matches backend.**

### Indexes

- `{ vendor: 1 }` (implicit, from `index: true` on vendor)
- `{ slug: 1 }` unique (from `unique: true, index: true`)
- `{ status: 1, createdAt: -1 }`
- `{ vendor: 1, status: 1 }`
- `{ tags: 1 }`

### Slug generation

`models/VendorPost.js:28-40` — fires on `validate` when `isNew || isModified('title')`:

```js
const base = this.title
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .substring(0, 80);
this.slug = `${base}-${this.vendor.toString().slice(-6)}`;
```

Uniqueness is achieved by appending the last 6 chars of the vendor ObjectId. **There is no timestamp suffix** — if the same vendor publishes two posts with the same title, the second will collide on the unique slug index and the create endpoint returns `409 "A post with this title already exists"` (`routes/vendorPostRoutes.js:88-90`).

---

## 7. Scheduled jobs related to vendor posts

**None.**

- `jobs/scheduledReports.js` is the only file in `jobs/`. It handles AEO report generation and the weekly AI mention scan — it imports `AeoReport`, `generateFullReport`, `aeoReportPdf`, `emailService`, `runWeeklyMentionScan`. **It does not import `VendorPost`.**
- Searched for `bullmq`, `new CronJob`, `node-cron`, `cron.schedule` across the codebase — only hit is `jobs/scheduledReports.js`.
- No `VendorPost` / `vendor-posts` / `blog` references in `jobs/`.

So: no scheduled publishing, no amplification cron, no post-publish verification job, no republish job. Everything post-related is synchronous on the request path.

---

## 8. Fields the frontend asked about — confirm absent

Grepped `models/VendorPost.js` and `routes/vendorPostRoutes.js` for `storedPlan | smvScore | amplification | postPublishTest | publishTest | SMV` — **zero matches**.

| Field | Present on VendorPost? |
|---|---|
| Stored generator plan (multi-step plan output captured before body generation) | ✗ **No** |
| Amplification tracking (LinkedIn/Facebook publish status, click counts, syndication targets) | ✗ **No** |
| Post-publish test results (post-publish LLM-visibility check, ping, structured-data validation) | ✗ **No** |
| SMV score (or any per-post visibility / quality score) | ✗ **No** |

The only quality-ish fields currently on the model are `aiGenerated` (Boolean) and the raw inputs (`topic`, `stats`). If v7 needs any of the four above, they're additive schema work.

---

## 9. Status enum — what backend actually accepts

`models/VendorPost.js:13-17`:

```js
status: {
  type: String,
  enum: ['draft', 'published', 'hidden'],
  default: 'draft',
},
```

**Backend accepts all three: `draft`, `published`, `hidden`.** Default is `draft`.

The frontend audit claim "status enum: `['published', 'hidden']`" → **incomplete**. `draft` is a valid value and the default.

Edge case in the create handler that's worth flagging (`routes/vendorPostRoutes.js:76`):

```js
status: status === 'draft' ? 'draft' : 'published',
```

If the request body sends `status: 'hidden'` on the **create** endpoint, the handler silently coerces it to `'published'`. The model enum allows `hidden` but the create route forces `published`. Hiding a post works only through `PUT /:vendorId/posts/:postId/hide` (line 266) or via `PUT /:vendorId/posts/:postId` (line 96). This coercion is probably a bug but it's outside the current audit scope — flagging only.

---

## 10. Scoring current prompt against v7 rules

Rules are measured against the Yadav-format bullets in the system prompt (§2) and the user prompt structure.

| Rule | Status | Evidence / reasoning |
|---|---|---|
| **#2 Intro citation stack** (first 200 words: direct answer + bullets) | ⚠️ partial | Prompt says *"Answer the most likely reader question in the first 100 words"* and *"Start with a bold statement or statistic that hooks the reader"*. That covers the direct-answer half but **not the citation stack / bullets pattern**. No instruction to lead with a bullet list or cite sources in the intro. First-100 vs first-200-word window also differs. |
| **#3 Statistical density** (every H2 opens with data) | ⚠️ partial | Prompt mentions *"Include specific numbers, percentages, or named examples where possible"* and *"Include a clear H2 subheading every 150-200 words"* — but **these two rules are independent**. There is no instruction that each H2 must open with a statistic. "Where possible" is a soft nudge, not a density target. |
| **#4 Passage discipline** (1 idea/para, 2-4 sentences, no cross-refs) | ⚠️ partial | *"Use short paragraphs of 2-3 sentences maximum"* — aligns on sentence count (2-3 vs 2-4). **No mention of "one idea per paragraph"** and **no mention of "no cross-references"**. Partial alignment on the length constraint only. |
| **#10 Named entity density** | ✗ not mentioned | *"named examples where possible"* appears once, but no density target, no guidance on what counts as a named entity, no quantitative instruction. Effectively absent. |
| **#11 Definition blocks** | ✗ not mentioned | No instruction to define key terms, emit definition paragraphs, or use a definition block format. Nothing in the prompt references this rule. |
| **#12 Year-in-title / recency** | ✗ not mentioned | No instruction to include the year in the title, to reference recent events, or to enforce recency signals. Title format is left entirely to the LLM. |
| **#13 UK English** | ✓ enforced | Final bullet of Yadav rules: *"UK English spelling throughout"*. Explicit. |

Overall against v7: **1 rule cleanly enforced (#13), 3 rules partially addressed (#2, #3, #4), 3 rules entirely absent (#10, #11, #12).**

---

## Summary for the v7 rewrite

- **Architecture**: one LLM call, single prompt, JSON-structured return. If v7 wants a plan step + generation step, that's a two-call restructure.
- **Vertical awareness**: currently one label injection. Adding per-vertical sub-prompts (e.g. different entity-density examples for solicitors vs accountants) is a prompt-composition change, not an architectural one.
- **Post-processing**: minimal — regex + JSON.parse + pass-through. Anywhere v7 wants enforcement (UK spelling check, year-in-title validator, passage discipline audit) has to be added as new post-processing, it does not exist today.
- **Model changes needed for v7**: if v7 wants any of {storedPlan, amplificationTracking, postPublishTestResults, SMVscore}, the VendorPost schema needs additive fields. None exist today.
- **Scheduled jobs needed for v7**: if v7 wants auto-amplification or post-publish verification, a new file under `jobs/` is required; there is no existing cron infrastructure for posts.
- **Double-mount** at `/api/vendors` and `/api/posts` (index.js:297-298) is live — both paths accept the generate request. Worth a separate cleanup task, not blocking v7.
- **Create-route status coercion** (`status === 'draft' ? 'draft' : 'published'`) silently drops `hidden` on create. Separate bug, flag only.
